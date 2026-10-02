import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FINDINGS, InputError, ORDER, RELEASES, findRelease, judge, parseDay, readOptions, standing } from '../src/index.js';
import { TODAY, decl, find, ids, report, subjects } from './helpers.js';

const day = (text) => parseDay(text);
const rel = (runtime, version) => findRelease(runtime, version);
const judgeAt = (d, today = TODAY, extra = {}) => judge(d, { todayDay: day(today), soonDays: 180, dates: true, ...extra });

test('standing: a release is past its end on the end date itself, and supported on the day before', () => {
  const node18 = rel('node', '18');
  assert.deepEqual(standing(node18, day('2025-04-30'), 180), { status: 'past', daysPast: 0 });
  assert.deepEqual(standing(node18, day('2025-05-01'), 180), { status: 'past', daysPast: 1 });
  const before = standing(node18, day('2025-04-29'), 0);
  assert.equal(before.status, 'supported');
  assert.equal(before.daysLeft, 1);
});

test('standing: the --soon-days limit is inclusive, and 0 makes only the last day before the end a warning-free day', () => {
  const node20 = rel('node', '20');
  assert.equal(standing(node20, day('2025-11-01'), 180).daysLeft, 180);
  assert.equal(standing(node20, day('2025-11-01'), 180).status, 'soon');
  assert.equal(standing(node20, day('2025-10-31'), 180).status, 'supported');
  assert.equal(standing(node20, day('2026-04-29'), 0).status, 'supported');
  assert.equal(standing(node20, day('2026-04-29'), 1).status, 'soon');
  assert.equal(standing(node20, day('2026-04-30'), 3650).status, 'past');
});

test('standing: a date that is only a month is read as the whole month', () => {
  const py = rel('python', '3.11');
  assert.equal(py.precision, 'month');
  const early = standing(py, day('2027-09-30'), 180);
  assert.deepEqual([early.status, early.daysLeft, early.monthOnly], ['soon', 1, true]);
  const first = standing(py, day('2027-10-01'), 180);
  assert.deepEqual([first.status, first.thisMonth], ['soon', true]);
  assert.equal(standing(py, day('2027-10-31'), 0).status, 'soon');
  const after = standing(py, day('2027-11-01'), 180);
  assert.deepEqual([after.status, after.daysPast], ['past', 1]);
  assert.equal(standing(py, day('2027-11-10'), 180).daysPast, 10);
  const far = standing(py, day('2026-03-01'), 180);
  assert.equal(far.status, 'supported');
  assert.equal(far.monthOnly, true);
});

test('standing: a release with no end date is supported, and a Java LTS minimum never ends', () => {
  assert.deepEqual(standing(rel('ruby', '4.0'), day(TODAY), 180), { status: 'unannounced' });
  assert.deepEqual(standing(rel('go', '1.27'), day(TODAY), 180), { status: 'unannounced' });
  const j17 = rel('java', '17');
  assert.equal(j17.kind, 'minimum');
  const now = standing(j17, day(TODAY), 180);
  assert.deepEqual([now.status, now.passed], ['minimum', false]);
  assert.deepEqual([standing(j17, day('2027-10-31'), 180).passed, standing(j17, day('2027-11-01'), 180).passed], [false, true]);
  assert.equal(standing(j17, day('2040-01-01'), 180).status, 'minimum');
});

test('standing: Go follows the policy: the end of a release is the day of the second newer one', () => {
  const go125 = rel('go', '1.25');
  assert.equal(go125.end, '2026-08-19');
  assert.equal(go125.kind, 'policy');
  assert.equal(standing(go125, day('2026-08-18'), 0).status, 'supported');
  assert.equal(standing(go125, day('2026-08-19'), 0).status, 'past');
});

test('judge: past support is an error that says lowest, the count of days and the date, and quotes the page', () => {
  const f = judgeAt(decl('node', '18', { range: true, file: 'package.json', where: 'engines.node', raw: '>=18' }), '2026-03-01');
  assert.equal(f.id, 'runtime-past-support');
  assert.equal(f.severity, 'error');
  assert.equal(f.subject, 'Node.js 18');
  assert.match(f.message, /^package\.json engines\.node ">=18" allows Node\.js 18 as its lowest version, which is past its end of support: it ended 305 days ago \(on 2025-04-30\)\.$/);
  assert.match(f.fix, /Raise the lower limit/);
  assert.equal(f.details.daysPast, 305);
  assert.equal(f.details.end, '2025-04-30');
  assert.equal(f.manual[0].url, 'https://nodejs.org/en/about/previous-releases');
  assert.match(f.manual[0].quote, /^Production applications/);
});

test('judge: a single declared version says "names" and the fix says to change the file', () => {
  const f = judgeAt(decl('php', '7.4', { file: 'web/Dockerfile', where: 'FROM line 6', raw: 'php:7.4-apache' }));
  assert.match(f.message, /^web\/Dockerfile FROM line 6 "php:7\.4-apache" names PHP 7\.4, which is past its end of support: it ended 1,189 days ago/);
  assert.match(f.fix, /change this file to name it/);
});

test('judge: a file whose own name is the place is not named twice', () => {
  const f = judgeAt(decl('node', '20', { file: 'app/.nvmrc', where: '.nvmrc', raw: '20' }));
  assert.match(f.message, /^app\/\.nvmrc "20" names Node\.js 20/);
});

test('judge: support that ends within --soon-days is a warning, with the days left and a note of the limit', () => {
  const f = judgeAt(decl('node', '20'), '2026-03-01');
  assert.equal(f.id, 'runtime-ending-soon');
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /whose support ends in 60 days \(on 2026-04-30\)\. That is within the 180 days of --soon-days\.$/);
  const tight = judgeAt(decl('node', '20'), '2026-03-01', { soonDays: 59 });
  assert.equal(tight.id, 'runtime-supported');
  assert.equal(judgeAt(decl('node', '20'), '2026-03-01', { soonDays: 60 }).id, 'runtime-ending-soon');
});

test('judge: a supported release is info, with the days left', () => {
  const f = judgeAt(decl('node', '24'), '2026-03-01');
  assert.equal(f.id, 'runtime-supported');
  assert.equal(f.severity, 'info');
  assert.match(f.message, /which is supported; its support ends in 791 days \(on 2028-04-30\)\.$/);
  assert.equal(f.fix, 'Nothing to fix now.');
});

test('judge: a month-only date is worded as the month, and a day in the month it ends is a warning', () => {
  assert.match(judgeAt(decl('python', '3.13')).message, /ends in 1,310 days at the earliest \(2029-10\); the page gives the month only/);
  const ending = judgeAt(decl('python', '3.11'), '2027-10-15');
  assert.equal(ending.id, 'runtime-ending-soon');
  assert.match(ending.message, /ends this month \(2027-10\); the page gives the month only/);
  const past = judgeAt(decl('python', '3.11'), '2027-12-01');
  assert.equal(past.id, 'runtime-past-support');
  assert.match(past.message, /ended at least 31 days ago \(in 2027-10\), in the month the page gives/);
});

test('judge: a Java LTS release is info with the vendor minimum, and quotes the footnote of the table', () => {
  const f = judgeAt(decl('java', '17', { file: 'pom.xml', where: 'java.version', raw: '17' }));
  assert.equal(f.id, 'runtime-vendor-minimum');
  assert.equal(f.severity, 'info');
  assert.match(f.message, /an LTS release that Eclipse Temurin builds until at least 2027-10; the page states no end\.$/);
  assert.equal(f.manual.length, 2);
  assert.match(f.manual[1].section, /footnote 1/);
  const later = judgeAt(decl('java', '17'), '2028-01-01');
  assert.match(later.message, /that minimum is behind the report date and the page states no end/);
});

test('judge: a Java release that is not LTS ends in the month the page gives, and quotes the end of service footnote', () => {
  const f = judgeAt(decl('java', '24'), TODAY);
  assert.equal(f.id, 'runtime-past-support');
  assert.match(f.message, /ended at least \d+ days ago \(in 2025-09\)/);
  assert.match(f.manual[1].section, /footnote 2/);
  assert.match(f.manual[1].quote, /no longer being maintained/);
});

test('judge: a release with no end date and a date that follows from the policy are worded as such', () => {
  const ruby = judgeAt(decl('ruby', '4.0'));
  assert.equal(ruby.id, 'runtime-supported');
  assert.match(ruby.message, /the saved page gives no end date yet\.$/);
  const expected = judgeAt(decl('ruby', '3.3'), '2026-03-01');
  assert.match(expected.message, /The page marks this date as expected\.$/);
  const go = judgeAt(decl('go', '1.24', { file: 'go.mod', where: 'go directive', raw: '1.24' }), '2026-09-01');
  assert.equal(go.id, 'runtime-past-support');
  assert.match(go.message, /The date is the day the second newer major release came out/);
});

test('judge: --no-dates leaves out every date and keeps the days', () => {
  const f = judgeAt(decl('node', '18'), TODAY, { dates: false });
  assert.match(f.message, /it ended 305 days ago\.$/);
  assert.equal(f.details.end, null);
  assert.doesNotMatch(JSON.stringify(f), /\b(?:19|20)\d{2}\b/);
  for (const [runtime, key] of [['python', '3.13'], ['java', '17'], ['ruby', '3.3'], ['node', '20'], ['go', '1.25'], ['dotnet', '8'], ['php', '8.2']]) {
    assert.doesNotMatch(JSON.stringify(judgeAt(decl(runtime, key), TODAY, { dates: false })), /\b(?:19|20)\d{2}\b/, `${runtime} ${key}`);
  }
});

test('judge: a version that is not in the data is info with the reason, and no date is guessed', () => {
  const f = judgeAt(decl('node', '99', { range: true }));
  assert.equal(f.id, 'version-not-in-data');
  assert.equal(f.severity, 'info');
  assert.match(f.message, /Node\.js 99 as its lowest version, which is not on the saved lifecycle page, so no date is read\.$/);
  assert.equal(judgeAt(decl('dotnet', '11')).id, 'version-not-in-data');
  assert.equal(judgeAt(decl('java', '9')).id, 'version-not-in-data');
  assert.equal(judgeAt(decl('python', '2.5')).id, 'version-not-in-data');
});

test('judge: a value that could not be read is info with the reason from the reader', () => {
  const f = judgeAt(decl('node', null, { key: null, lowest: null, reason: 'the value allows any version, so there is no lowest version to read', raw: '*', file: 'package.json', where: 'engines.node' }));
  assert.equal(f.id, 'version-unreadable');
  assert.equal(f.severity, 'info');
  assert.match(f.message, /^package\.json engines\.node "\*": the version could not be read: the value allows any version/);
});

test('judge: every runtime has releases that come out past, soon and supported on the right day', () => {
  const cases = [
    ['node', '18', '2025-05-01', 'runtime-past-support'], ['node', '22', '2027-03-01', 'runtime-ending-soon'], ['node', '24', '2026-03-01', 'runtime-supported'],
    ['python', '3.9', '2025-11-01', 'runtime-past-support'], ['python', '3.12', '2028-08-01', 'runtime-ending-soon'], ['python', '3.14', '2026-03-01', 'runtime-supported'],
    ['dotnet', '6', '2024-11-12', 'runtime-past-support'], ['dotnet', '8', '2026-10-01', 'runtime-ending-soon'], ['dotnet', '10', '2026-03-01', 'runtime-supported'],
    ['php', '8.1', '2026-01-01', 'runtime-past-support'], ['php', '8.3', '2027-12-01', 'runtime-ending-soon'], ['php', '8.5', '2026-03-01', 'runtime-supported'],
    ['ruby', '3.2', '2026-04-01', 'runtime-past-support'], ['ruby', '3.3', '2027-02-01', 'runtime-ending-soon'], ['ruby', '3.4', '2026-03-01', 'runtime-supported'],
    ['go', '1.24', '2026-02-10', 'runtime-past-support'], ['go', '1.25', '2026-08-01', 'runtime-ending-soon'], ['go', '1.26', '2026-03-01', 'runtime-supported'],
    ['java', '18', '2022-10-01', 'runtime-past-support'], ['java', '27', '2027-02-01', 'runtime-ending-soon'], ['java', '21', '2026-03-01', 'runtime-vendor-minimum']
  ];
  for (const [runtime, key, today, expected] of cases) assert.equal(judgeAt(decl(runtime, key), today).id, expected, `${runtime} ${key} on ${today}`);
});

test('options: defaults, and a value that cannot be used is an input error that says what to give', () => {
  const o = readOptions({});
  assert.equal(o.soonDays, 180);
  assert.equal(o.maxDepth, 8);
  assert.equal(o.dates, true);
  assert.equal(o.defaultSkip, true);
  assert.match(o.today, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(readOptions({ today: '2030-02-28', soonDays: '0', maxDepth: 0 }).soonDays, 0);
  const bad = [
    [{ soonDays: '-1' }, /--soon-days takes a whole number from 0 to 3650/],
    [{ soonDays: '3651' }, /--soon-days/],
    [{ soonDays: '1.5' }, /--soon-days/],
    [{ soonDays: 'many' }, /--soon-days/],
    [{ maxDepth: '33' }, /--max-depth takes a whole number from 0 to 32/],
    [{ maxDepth: 'x' }, /--max-depth/],
    [{ today: '2026-02-30' }, /--today takes a calendar day written YYYY-MM-DD/],
    [{ today: 'tomorrow' }, /--today/],
    [{ skip: [''] }, /--skip takes a folder name/],
    [{ skip: ['a/b'] }, /--skip takes a folder name/],
    [{ skip: ['a\\b'] }, /--skip takes a folder name/],
    [{ skip: [`a${String.fromCharCode(10)}b`] }, /--skip takes a folder name/],
    [{ skip: Array.from({ length: 51 }, (_, i) => `n${i}`) }, /at most 50 times/]
  ];
  for (const [options, pattern] of bad) assert.throws(() => readOptions(options), (e) => e instanceof InputError && pattern.test(e.message), JSON.stringify(options).slice(0, 60));
});

test('report: a folder with an old and a new declaration gives counts, a gate and findings in the order of the checks', async () => {
  const r = await report({ 'package.json': '{"engines":{"node":">=18"}}', '.nvmrc': '20\n', 'svc/.nvmrc': '24\n', 'pom.xml': '<java.version>17</java.version>' });
  assert.deepEqual(ids(r), ['runtime-past-support', 'runtime-ending-soon', 'runtime-supported', 'runtime-vendor-minimum']);
  assert.deepEqual(r.counts, { error: 1, warning: 1, info: 2 });
  assert.equal(r.gate.pass, false);
  assert.equal(r.gate.reason, '1 error');
  assert.equal(r.today, TODAY);
  assert.equal(r.input.declarations, 4);
  assert.equal(r.input.files, 4);
  assert.equal(r.input.filesRead, 4);
  assert.equal(r.target.startsWith('eol-runtime-check-'), true);
});

test('report: --fail-on warning fails on a warning, and the default only on an error', async () => {
  const files = { '.nvmrc': '20\n', 'svc/.nvmrc': '24\n' };
  const byDefault = await report(files);
  assert.deepEqual(byDefault.counts, { error: 0, warning: 1, info: 1 });
  assert.equal(byDefault.gate.pass, true);
  const strict = await report(files, { failOn: 'warning' });
  assert.equal(strict.gate.pass, false);
  assert.equal(strict.gate.reason, '1 warning');
  assert.equal(strict.gate.failOn, 'warning');
});

test('report: the gate names errors and warnings together, with singular and plural', async () => {
  const r = await report({ 'a/.nvmrc': '16\n', 'b/.nvmrc': '18\n', 'c/.nvmrc': '20\n' }, { failOn: 'warning' });
  assert.equal(r.gate.reason, '2 errors and 1 warning');
});

test('report: info findings never fail a run, whatever the level', async () => {
  const r = await report({ '.nvmrc': '24\n', 'pom.xml': '<java.version>17</java.version>', 'x/package.json': '{"engines":{"node":"*"}}' }, { failOn: 'warning' });
  assert.deepEqual(r.counts, { error: 0, warning: 0, info: 3 });
  assert.equal(r.gate.pass, true);
  assert.equal(r.gate.reason, '');
});

test('report: a folder with no declaration gets one info finding that says what was looked at', async () => {
  const r = await report({ 'readme.txt': 'hello' });
  assert.deepEqual(ids(r), ['no-runtime-found']);
  assert.match(r.findings[0].message, /^No declared runtime or framework version was found in 0 files read \(0 files of interest, 1 folder looked at\)\./);
  assert.equal(r.gate.pass, true);
});

test('report: a file that cannot be read is a finding with the reason, and the other files are still read', async () => {
  const r = await report({ 'package.json': '{"engines":', '.nvmrc': '18\n' });
  assert.deepEqual(ids(r), ['runtime-past-support', 'file-not-read']);
  assert.match(find(r, 'file-not-read')[0].message, /^package\.json is not valid JSON/);
  assert.equal(r.input.filesRead, 1);
  assert.deepEqual(subjects(r, 'file-not-read'), ['package.json']);
});

test('report: --no-dates leaves the report date and every end date out, in the JSON too', async () => {
  const r = await report({ 'package.json': '{"engines":{"node":">=18"}}', '.nvmrc': '20\n', 'svc/pom.xml': '<java.version>17</java.version>' }, { dates: false });
  assert.equal(r.today, null);
  assert.doesNotMatch(JSON.stringify(r), /\b(?:19|20)\d{2}\b/);
  assert.equal(find(r, 'runtime-past-support')[0].details.daysPast, 305);
});

test('report: the same folder gives the same report on every run, and the findings are sorted by check, file and place', async () => {
  const files = { 'z/.nvmrc': '16\n', 'a/.nvmrc': '16\n', 'm/package.json': '{"engines":{"node":"14"}}', 'Dockerfile': 'FROM node:12\nFROM node:10\n' };
  const a = await report(files);
  const b = await report(files);
  assert.equal(JSON.stringify({ ...a, target: '' }), JSON.stringify({ ...b, target: '' }));
  assert.deepEqual(a.findings.map((f) => f.file), ['Dockerfile', 'Dockerfile', 'a/.nvmrc', 'm/package.json', 'z/.nvmrc']);
  assert.deepEqual(a.findings.slice(0, 2).map((f) => f.where), ['FROM line 1', 'FROM line 2']);
});

test('rules: every finding id is unique, has a severity, and has an order that matches the list', () => {
  assert.equal(FINDINGS.length, new Set(FINDINGS.map((f) => f.id)).size);
  for (const f of FINDINGS) assert.ok(['error', 'warning', 'info'].includes(f.severity), f.id);
  assert.deepEqual(Object.keys(ORDER), FINDINGS.map((f) => f.id));
  assert.equal(FINDINGS.filter((f) => f.severity === 'error').length, 1);
  assert.equal(FINDINGS.filter((f) => f.severity === 'warning').length, 1);
  assert.ok(RELEASES.node.length > 0);
});
