import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FINDINGS, USAGE, VERSION, csvCell, judge, mdCell, parseArgs, parseDay, toCsv, toJson, toMarkdown, toText } from '../src/index.js';
import { TODAY, cli, decl, report, run } from './helpers.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const FILES = { 'package.json': '{"engines":{"node":">=18"}}', '.nvmrc': '20\n', 'svc/pom.xml': '<java.version>17</java.version>' };
const ARGS = ['.', '--today', TODAY];

test('text: the folder, what was read, the report date, the counts, each finding with its fix and source, and the gate line', async () => {
  const r = await run(FILES, [...ARGS, '--fail-on', 'warning']);
  const lines = r.out.split('\n');
  assert.match(lines[0], /^eol-runtime-check: eol-runtime-check-/);
  assert.equal(lines[1], 'read: 3 files of interest in 2 folders, 3 declarations');
  assert.equal(lines[2], 'report date: 2026-03-01');
  assert.equal(lines[3], 'findings: 1 error, 1 warning, 1 info');
  assert.ok(r.out.includes('ERROR    runtime-past-support  Node.js 18\n'));
  assert.ok(r.out.includes('         fix: Raise the lower limit'));
  assert.ok(r.out.includes('         source (Node.js, previous releases, Node.js Releases): "Production applications should only use Active LTS or Maintenance LTS releases."\n           https://nodejs.org/en/about/previous-releases\n'));
  assert.ok(r.out.endsWith('GATE: FAIL - 1 error and 1 warning\n'));
  assert.ok(!r.out.includes('\r'));
  assert.equal(r.code, 1);
});

test('text: a run with no finding says so, and shows the gate that was used', () => {
  const empty = toText({ tool: 'eol-runtime-check', target: 'x', today: null, input: { files: 0, folders: 1, declarations: 0 }, findings: [], notes: [], counts: { error: 0, warning: 0, info: 0 }, gate: { failOn: 'warning', pass: true, reason: '' } });
  assert.ok(empty.includes('\nno findings\n'));
  assert.ok(empty.includes('report date: left out (--no-dates)'));
  assert.match(empty, /GATE: PASS \(--fail-on warning\)\n$/);
});

test('text: the notes come before the gate line', async () => {
  const r = await run({ 'node_modules/a/package.json': '{}', '.nvmrc': '24\n' }, ARGS);
  assert.match(r.out, /\nnote: 1 folder skipped by name \(node_modules 1\); --skip and --no-default-skip change this\.\n\nGATE: PASS/);
});

test('markdown: a table with one row per finding, the sources as links, and a gate line', async () => {
  const r = await run(FILES, [...ARGS, '--format', 'markdown', '--fail-on', 'warning']);
  assert.match(r.out, /^## eol-runtime-check: 1 error, 1 warning, 1 info\n\neol-runtime-check-.*, 3 files of interest in 2 folders, 3 declarations\. Report date: 2026-03-01\.\n/);
  assert.ok(r.out.includes('| Severity | Check | About | Message | Fix | Source |'));
  assert.ok(r.out.includes('| error | runtime-past-support | Node.js 18 |'));
  assert.ok(r.out.includes('[Node.js, previous releases, Node.js Releases](https://nodejs.org/en/about/previous-releases): "Production applications'));
  assert.ok(r.out.endsWith('**Gate failed:** 1 error and 1 warning.\n'));
  assert.equal(r.code, 1);
});

test('markdown: a pipe, an angle bracket, an ampersand, a backslash and a line break from a file cannot break the table or be read as HTML', () => {
  assert.equal(mdCell('a|b<c>&d\\e\nf'), 'a\\|b&lt;c&gt;&amp;d\\\\e f');
  const f = judge(decl('node', '18', { raw: 'x|<script>alert(1)</script>', file: 'a|b/package.json' }), { todayDay: parseDay(TODAY), soonDays: 180, dates: true });
  const md = toMarkdown({ tool: 'eol-runtime-check', target: 'p|q', today: TODAY, input: { files: 1, folders: 1, declarations: 1 }, findings: [f], notes: ['n|<b>'], counts: { error: 1, warning: 0, info: 0 }, gate: { failOn: 'error', pass: false, reason: '1 error' } });
  assert.ok(!md.includes('<script>'));
  assert.ok(!md.includes('<b>'));
  assert.ok(md.includes('x\\|&lt;script&gt;'));
  for (const line of md.split('\n').filter((l) => l.startsWith('| error'))) assert.equal(line.replace(/\\\|/g, '').split('|').length - 1, 7);
});

test('json: the whole report, with the input, every finding, the notes, the options and the gate', async () => {
  const r = JSON.parse((await run(FILES, [...ARGS, '--format', 'json', '--soon-days', '90'])).out);
  assert.equal(r.tool, 'eol-runtime-check');
  assert.equal(r.version, VERSION);
  assert.equal(r.today, TODAY);
  assert.equal(r.input.declarations, 3);
  assert.deepEqual(r.options, { soonDays: 90, maxDepth: 8, skip: [], defaultSkip: true, dates: true, failOn: 'error' });
  assert.equal(r.findings.length, 3);
  const past = r.findings[0];
  assert.equal(past.id, 'runtime-past-support');
  assert.deepEqual([past.file, past.where, past.declared], ['package.json', 'engines.node', '>=18']);
  assert.equal(past.details.end, '2025-04-30');
  assert.equal(past.details.daysPast, 305);
  assert.equal(past.details.lowest, '18');
  assert.equal(past.details.range, true);
  assert.equal(past.manual[0].page, 'Node.js, previous releases');
  assert.equal(r.gate.pass, false);
});

test('json: the same text again with no dates holds no date, and the day counts stay', async () => {
  const out = (await run(FILES, [...ARGS, '--format', 'json', '--no-dates'])).out;
  const r = JSON.parse(out);
  assert.equal(r.today, null);
  assert.doesNotMatch(out, /\b(?:19|20)\d{2}\b/);
  assert.equal(r.findings[0].details.daysPast, 305);
  assert.equal(r.findings[0].details.end, null);
});

test('csv: one row per finding with a header, CRLF line ends, and the numbers in columns', async () => {
  const out = (await run(FILES, [...ARGS, '--format', 'csv'])).out;
  const lines = out.split('\r\n');
  assert.equal(lines[0], 'severity,id,subject,file,where,declared,days_left,days_past,end,message,fix,source_page,source_url');
  assert.equal(lines.length, 5);
  assert.equal(lines.at(-1), '');
  assert.match(lines[1], /^error,runtime-past-support,Node\.js 18,package\.json,engines\.node,>=18,,305,2025-04-30,/);
  assert.match(lines[2], /^warning,runtime-ending-soon,Node\.js 20,\.nvmrc,\.nvmrc,20,60,,2026-04-30,/);
  assert.ok(lines[1].endsWith(',"Node.js, previous releases",https://nodejs.org/en/about/previous-releases'));
});

test('csv: a cell that a spreadsheet would run as a formula gets a leading quote, and a cell with a comma or quote is quoted', () => {
  assert.equal(csvCell('=SUM(A1)'), "'=SUM(A1)");
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('-1'), "'-1");
  assert.equal(csvCell('@x'), "'@x");
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(0), '0');
  const f = judge(decl('node', '18', { raw: '=HYPERLINK("http://x")' }), { todayDay: parseDay(TODAY), soonDays: 180, dates: true });
  const out = toCsv({ findings: [f] });
  assert.ok(out.includes('"\'=HYPERLINK(""http://x"")"'));
});

test('json and csv are produced from the same report without changing it', async () => {
  const r = await report(FILES);
  const before = JSON.stringify(r);
  toJson(r);
  toCsv(r);
  toMarkdown(r);
  toText(r);
  assert.equal(JSON.stringify(r), before);
});

test('cli: --help and --version print and exit with 0', async () => {
  const help = await cli(['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  assert.equal(help.err, '');
  assert.match(help.out, /^Usage: eol-runtime-check <folder> \[options\]/);
  for (const f of FINDINGS) assert.ok(help.out.includes(f.id), f.id);
  const version = await cli(['--version']);
  assert.equal(version.code, 0);
  assert.equal(version.out, `${VERSION}\n`);
  assert.match(VERSION, /^\d+\.\d+\.\d+$/);
  assert.equal((await cli(['-h'])).code, 0);
  assert.equal((await cli(['-v'])).out, `${VERSION}\n`);
});

test('cli: the usage text names every option and the exit codes, and holds no calendar year', () => {
  for (const option of ['--format', '--fail-on', '--soon-days', '--today', '--no-dates', '--max-depth', '--skip', '--no-default-skip', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  assert.match(USAGE, /Exit codes: 0 .* 1 .* 2/s);
  assert.doesNotMatch(USAGE, /\b(?:19|20)\d{2}\b/);
});

test('cli: a usage error is exit code 2, writes the reason and the usage to standard error, and nothing to standard output', async () => {
  const cases = [
    [[], /give the path of the folder/],
    [['a', 'b'], /give one folder/],
    [['.', '--nope'], /unknown argument --nope/],
    [['.', '--format', 'xml'], /unknown format xml/],
    [['.', '--format'], /--format needs a value/],
    [['.', '--fail-on', 'info'], /--fail-on takes error or warning, not info/],
    [['.', '--fail-on', '--format'], /--fail-on needs a value/],
    [['-'], /standard input is not supported/],
    [['https://example.com/project'], /never fetches a URL/],
    [['.', '--soon-days', 'many'], /--soon-days takes a whole number/],
    [['.', '--today', '2026-02-30'], /--today takes a calendar day/],
    [['.', '--max-depth', '99'], /--max-depth takes a whole number/],
    [['.', '--skip', 'a/b'], /--skip takes a folder name/]
  ];
  for (const [args, pattern] of cases) {
    const r = await run({ 'a.txt': 'x' }, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.equal(r.out, '', args.join(' '));
    assert.match(r.err, pattern, args.join(' '));
    assert.match(r.err, /eol-runtime-check: /);
  }
});

test('cli: a folder that does not exist, and a file in place of a folder, are exit code 2 with the name and nothing on standard output', async () => {
  const missing = await run({ 'a.txt': 'x' }, ['no-such-folder']);
  assert.equal(missing.code, 2);
  assert.equal(missing.out, '');
  assert.equal(missing.err, 'eol-runtime-check: no-such-folder: no such folder\n');
  const file = await run({ 'a.txt': 'x' }, ['a.txt']);
  assert.equal(file.code, 2);
  assert.match(file.err, /^eol-runtime-check: a\.txt is not a folder/);
});

test('cli: exit 0 with only info findings, 1 with an error, and 1 with a warning only under --fail-on warning', async () => {
  assert.equal((await run({ '.nvmrc': '24\n' }, ARGS)).code, 0);
  assert.equal((await run({ '.nvmrc': '16\n' }, ARGS)).code, 1);
  assert.equal((await run({ '.nvmrc': '20\n' }, ARGS)).code, 0);
  assert.equal((await run({ '.nvmrc': '20\n' }, [...ARGS, '--fail-on', 'warning'])).code, 1);
  assert.equal((await run({ '.nvmrc': '24\n' }, [...ARGS, '--fail-on', 'warning'])).code, 0);
  assert.equal((await run({ '.nvmrc': '20\n' }, [...ARGS, '--fail-on', 'warning', '--soon-days', '10'])).code, 0);
  assert.equal((await run({ 'readme.txt': 'x' }, [...ARGS, '--fail-on', 'warning'])).code, 0);
});

test('cli: the options can be given in any order, and a folder option after the folder is the same as before it', async () => {
  const a = await run({ '.nvmrc': '20\n' }, ['--today', TODAY, '.', '--no-dates']);
  const b = await run({ '.nvmrc': '20\n' }, ['.', '--no-dates', '--today', TODAY]);
  assert.equal(a.out.replace(/^.*\n/, ''), b.out.replace(/^.*\n/, ''));
});

test('cli: --skip and --no-default-skip change what is read', async () => {
  const files = { 'node_modules/p/.nvmrc': '14\n', 'legacy/.nvmrc': '16\n', 'app/.nvmrc': '24\n' };
  assert.match((await run(files, ARGS)).out, /read: 2 files of interest in 3 folders, 2 declarations/);
  assert.match((await run(files, [...ARGS, '--skip', 'legacy'])).out, /read: 1 file of interest in 2 folders, 1 declaration\n/);
  assert.match((await run(files, [...ARGS, '--no-default-skip'])).out, /read: 3 files of interest in 5 folders, 3 declarations/);
});

test('cli: --max-depth changes how far down it reads, and the note says what was left', async () => {
  const files = { '.nvmrc': '24\n', 'a/.nvmrc': '24\n', 'a/b/.nvmrc': '24\n' };
  const r = await run(files, [...ARGS, '--max-depth', '1']);
  assert.match(r.out, /read: 2 files of interest in 2 folders/);
  assert.match(r.out, /note: 1 folder below 1 level was not read; --max-depth changes this\./);
});

test('args: the options are parsed into one object', () => {
  const o = parseArgs(['proj', '--format', 'json', '--fail-on', 'warning', '--soon-days', '30', '--today', '2026-03-01', '--no-dates', '--max-depth', '2', '--skip', 'a', '--skip', 'b', '--no-default-skip']);
  assert.deepEqual(o, { input: 'proj', format: 'json', failOn: 'warning', soonDays: '30', today: '2026-03-01', dates: false, maxDepth: '2', skip: ['a', 'b'], defaultSkip: false, help: false, version: false });
  assert.equal(parseArgs(['--help']).help, true);
  assert.equal(parseArgs(['--version', 'x']).version, true);
});

test('cli: the real command, run as a program, prints the report and returns the exit code', () => {
  const bin = resolve(root, 'bin', 'eol-runtime-check.js');
  const legacy = spawnSync(process.execPath, [bin, 'examples/billing-legacy', '--today', TODAY, '--no-dates', '--fail-on', 'warning'], { cwd: root, encoding: 'utf8' });
  assert.equal(legacy.status, 1);
  assert.match(legacy.stdout, /GATE: FAIL - 4 errors and 1 warning/);
  assert.equal(legacy.stderr, '');
  const modern = spawnSync(process.execPath, [bin, 'examples/billing-modernized', '--today', TODAY, '--fail-on', 'warning'], { cwd: root, encoding: 'utf8' });
  assert.equal(modern.status, 0);
  assert.match(modern.stdout, /GATE: PASS \(--fail-on warning\)/);
  const bad = spawnSync(process.execPath, [bin], { cwd: root, encoding: 'utf8' });
  assert.equal(bad.status, 2);
  assert.equal(bad.stdout, '');
  assert.match(bad.stderr, /give the path of the folder/);
});
