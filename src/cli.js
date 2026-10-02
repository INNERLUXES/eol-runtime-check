// Command line: eol-runtime-check <folder> [options]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULTS } from './lifecycle.js';
import { FINDINGS, checkFolder } from './check.js';
import { InputError } from './errors.js';
import { safeText } from './rules.js';
import { SCAN_LIMITS } from './scan.js';
import { toText, toMarkdown, toJson, toCsv } from './report.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, csv: toCsv };
const THRESHOLDS = ['error', 'warning'];

export const USAGE = `Usage: eol-runtime-check <folder> [options]

Reads a code folder and finds the runtime and framework versions that the project declares (Node.js, Python, .NET, Java,
PHP, Ruby and Go), then reports which of them are past the end of support or close to it, so that a modernization can be
planned. It reads only the files named in docs/inputs.md, as text. It never runs or imports what it reads, never
installs a package, never follows a symbolic link and never opens a connection. For a range such as ">=18" it reports
the lowest version the range allows.

Options:
  --format <name>          text, markdown, json or csv (default: text)
  --fail-on <level>        exit with 1 when a finding is at this level or above: error or warning
                           (default: error); info never fails the run
  --soon-days <n>          warn when support ends within this many days, 0 to 3650 (default: ${DEFAULTS.soonDays})
  --today <YYYY-MM-DD>     the report date (default: today, in UTC); use it to repeat a report for a given day
  --no-dates               leave every calendar date out of the report; only counts of days are shown
  --max-depth <n>          how many folder levels to go down, 0 to 32 (default: ${SCAN_LIMITS.maxDepth})
  --skip <name>            skip every folder with this name; repeat the option for more names
  --no-default-skip        do not skip node_modules, vendor, bin, obj, target, dist, .git and the other default names
  --help                   show this text
  --version                show the version

Checks: ${FINDINGS.map((f) => f.id).join(', ')}

Exit codes: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error (a folder that cannot be read,
a path that is not a folder, an option that cannot be used).
`;

export function parseArgs(argv) {
  const o = { input: null, format: 'text', failOn: 'error', soonDays: undefined, today: undefined, dates: true, maxDepth: undefined, skip: [], defaultSkip: true, help: false, version: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--format') o.format = next();
    else if (a === '--fail-on') o.failOn = next();
    else if (a === '--soon-days') o.soonDays = next();
    else if (a === '--today') o.today = next();
    else if (a === '--no-dates') o.dates = false;
    else if (a === '--max-depth') o.maxDepth = next();
    else if (a === '--skip') o.skip.push(next());
    else if (a === '--no-default-skip') o.defaultSkip = false;
    else if (a === '-') throw new Error('reading from standard input is not supported; give the path of a folder');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else if (o.input !== null) throw new Error('give one folder');
    else o.input = a;
  }
  if (!o.help && !o.version) {
    if (o.input === null) throw new Error('give the path of the folder to check');
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(o.input)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or csv)`);
    if (!THRESHOLDS.includes(o.failOn)) throw new Error(`--fail-on takes error or warning, not ${o.failOn}`);
  }
  return o;
}

const clean = (text) => safeText(text, 1000);

// Exit code: 0 no finding at the --fail-on level, 1 such a finding, 2 usage or input error. base is the folder that a
// relative path is worked out from.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, base = process.cwd(), extra = {}) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`eol-runtime-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkFolder(resolve(base, o.input), { failOn: o.failOn, version: VERSION, soonDays: o.soonDays, today: o.today, dates: o.dates, maxDepth: o.maxDepth, skip: o.skip, defaultSkip: o.defaultSkip, ...extra });
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    io.err(`eol-runtime-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report));
  return report.gate.pass ? 0 : 1;
}
