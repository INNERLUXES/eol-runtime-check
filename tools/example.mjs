// Runs the README examples, checks that they report what the README shows, and writes the reports of the legacy
// example to examples/output. CI runs it and then fails if those files changed, so the example output in the repository
// is always the real output. The report date is fixed here (--today) so that the day counts never change with the
// calendar; the README shows the runs with --no-dates, so it holds counts of days and no calendar date.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const TODAY = '2026-03-01';

// Runs the tool on folders of the repository; the name shown in the report is the name of the folder that is checked.
async function run(argv) {
  let out = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => process.stderr.write(t) }, root);
  return { code, out };
}

const problems = [];
function expect(name, result, code, expected, unwanted) {
  const missing = expected.filter((e) => !result.out.includes(e));
  const wrong = unwanted.filter((e) => result.out.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})`);
  }
}

const legacyArgs = ['examples/billing-legacy', '--fail-on', 'warning', '--today', TODAY, '--no-dates'];
const legacy = await run(legacyArgs);
process.stdout.write(legacy.out);
expect('legacy folder', legacy, 1, [
  'read: 6 files of interest in 5 folders, 7 declarations',
  'findings: 4 error, 1 warning, 2 info',
  'ERROR    runtime-past-support  Node.js 18',
  'ERROR    runtime-past-support  Python 3.8',
  'ERROR    runtime-past-support  .NET 6',
  'ERROR    runtime-past-support  PHP 7.4',
  'it ended 305 days ago',
  'WARNING  runtime-ending-soon  Node.js 20',
  'whose support ends in 60 days',
  'INFO     runtime-vendor-minimum  Java 11',
  'INFO     version-unreadable  ledger/Ledger.csproj',
  'GATE: FAIL - 4 errors and 1 warning'
], ['GATE: PASS']);

process.stdout.write('\n');
const modernArgs = ['examples/billing-modernized', '--fail-on', 'warning', '--today', TODAY, '--no-dates'];
const modern = await run(modernArgs);
process.stdout.write(modern.out);
expect('modernized folder with --fail-on warning', modern, 0, [
  'findings: 0 error, 0 warning, 6 info',
  'GATE: PASS (--fail-on warning)'
], ['ERROR', 'WARNING ']);

// The README shows the runs as they are printed.
const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
if (!readme.includes(legacy.out)) problems.push('README: the sample output of the legacy folder differs from a real run');
if (!readme.includes(modern.out)) problems.push('README: the sample output of the modernized folder differs from a real run');

// The same folder in the other formats, and once with the dates, kept as examples of what each one looks like.
await mkdir(resolve(root, 'examples/output'), { recursive: true });
await writeFile(resolve(root, 'examples/output/billing-legacy.txt'), legacy.out);
for (const [format, name] of [['markdown', 'billing-legacy.md'], ['json', 'billing-legacy.json'], ['csv', 'billing-legacy.csv']]) {
  const r = await run([...legacyArgs, '--format', format]);
  if (r.code !== 1) problems.push(`${format}: exit code ${r.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output', name), r.out);
}
const dated = await run(['examples/billing-legacy', '--fail-on', 'warning', '--today', TODAY]);
if (dated.code !== 1 || !dated.out.includes('(on 2025-04-30)') || !dated.out.includes('report date: 2026-03-01')) problems.push('the report with dates does not show the dates');
await writeFile(resolve(root, 'examples/output/billing-legacy-with-dates.txt'), dated.out);

if (problems.length) {
  for (const p of problems) console.error(`example: ${p}`);
  process.exit(1);
}
