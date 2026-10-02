import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { FACTS, GO_RELEASE_DAYS, NOTES, RELEASES, RUNTIMES, SOURCES, displayName, findRelease, parseDay, parseMonth, sourceLabel, sourceUrl } from '../src/index.js';

// These tests read the saved pages again with parsers of their own, and compare them with src/lifecycle.js: every
// version, every end date, how exact the date is, and every quoted sentence.

const dir = new URL('../research/sources/', import.meta.url);
const page = async (id) => readFile(new URL(SOURCES.find((s) => s.id === id).file, dir), 'utf8');
const rowsOf = (text) => text.split('\n').filter((l) => l.includes(' | ')).map((l) => l.split(' | ').map((c) => c.trim()));
const quotes = (t) => t.split(String.fromCharCode(0x2019)).join("'").split(String.fromCharCode(0x2018)).join("'").split(String.fromCharCode(0x201c)).join('"').split(String.fromCharCode(0x201d)).join('"');
// Text compared without line breaks, runs of white space or the typographic quotes.
const flat = (t) => quotes(t).replace(/\s+/g, ' ').trim();
const has = (text, needle) => flat(text).includes(flat(needle));
// The words of a tool that wrote a text, built from pieces so that this file does not hold them.
const WRITTEN = new RegExp(`\\b(?:${['A', 'I'].join('')}|${['cha', 't'].join('')}|${['clau', 'de'].join('')}|${['anthro', 'pic'].join('')}|${['ope', 'nai'].join('')})\\b`, 'i');
const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };
const LONG_MONTHS = { January: '01', February: '02', March: '03', April: '04', May: '05', June: '06', July: '07', August: '08', September: '09', October: '10', November: '11', December: '12' };
const entries = (runtime) => Object.fromEntries(RELEASES[runtime].map((r) => [r.version, r]));
const pick = (runtime) => RELEASES[runtime].map((r) => [r.version, r.end]);

test('sources: every saved page has its address on the first line and holds text, and every saved file is listed', async () => {
  for (const s of SOURCES) {
    const text = await page(s.id);
    assert.equal(text.split('\n')[0], `Source: ${s.url}`, s.file);
    assert.ok(text.length > 300, `${s.file} holds the page text`);
  }
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.url)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.file)).size);
  assert.equal(SOURCES.length, new Set(SOURCES.map((s) => s.id)).size);
  const files = (await readdir(dir)).sort();
  assert.deepEqual(files, SOURCES.map((s) => s.file).sort());
});

test('sources: the addresses are the official pages of the vendors, over https', () => {
  const hosts = SOURCES.map((s) => new URL(s.url).host).sort();
  assert.deepEqual(hosts, ['adoptium.net', 'dotnet.microsoft.com', 'devguide.python.org', 'github.com', 'go.dev', 'learn.microsoft.com', 'nodejs.org', 'www.php.net', 'www.php.net', 'www.ruby-lang.org'].sort());
  for (const s of SOURCES) assert.match(s.url, /^https:\/\//);
  assert.equal(sourceUrl('go'), 'https://go.dev/doc/devel/release');
  assert.equal(sourceLabel('go'), 'Go release history');
});

test('sources: no saved page mentions a tool that wrote it, holds a control byte or a carriage return', async () => {
  for (const s of SOURCES) {
    const text = await page(s.id);
    assert.doesNotMatch(text, WRITTEN, s.file);
    assert.doesNotMatch(text, new RegExp(`[${String.fromCharCode(1)}-${String.fromCharCode(8)}]`), s.file);
    assert.ok(!text.includes('\r'), s.file);
  }
});

test('node: every release and end-of-life date is the one of the schedule of the release working group', async () => {
  const found = {};
  for (const c of rowsOf(await page('node-schedule'))) {
    const m = /^v?(\d+(?:\.\d+)?)\.x$/.exec(c[0]);
    if (m && c.length === 7) found[m[1]] = c[6];
  }
  assert.deepEqual(Object.fromEntries(pick('node')), found);
  for (const r of RELEASES.node) {
    assert.equal(r.precision, 'day');
    assert.equal(r.kind, 'end');
    assert.equal(r.source, 'node-schedule');
  }
});

test('node: the previous releases page agrees: every version it calls EOL has an end date, and the supported ones have none passed in the table', async () => {
  const eol = [];
  const alive = [];
  for (const c of rowsOf(await page('node-previous'))) {
    const m = /^v (\d+)$/.exec(c[0]);
    if (!m) continue;
    (c[4] === 'EOL' ? eol : alive).push(m[1]);
  }
  assert.ok(eol.length >= 20);
  for (const v of eol) assert.ok(v === '0' ? findRelease('node', '0.12') : findRelease('node', v), `node ${v}`);
  assert.deepEqual(alive.sort(), ['22', '24', '26']);
});

test('python: every branch and end of life is the one of the status page, and a date with no day is kept as a month', async () => {
  const found = {};
  for (const c of rowsOf(await page('python'))) {
    if (/^\d\.\d+$/.test(c[0]) && c.length === 5) found[c[0]] = c[4];
  }
  assert.deepEqual(Object.fromEntries(pick('python')), found);
  for (const r of RELEASES.python) assert.equal(r.precision, r.end.length === 7 ? 'month' : 'day', r.version);
  assert.equal(entries('python')['3.11'].precision, 'month');
  assert.equal(entries('python')['3.10'].precision, 'day');
  assert.ok(!findRelease('python', 'main'));
});

test('dotnet: every version and end of support is the one of the support policy page', async () => {
  const found = {};
  for (const c of rowsOf(await page('dotnet-policy'))) {
    const m = /^\.NET(?: Core)? (\d+(?:\.\d+)?)$/.exec(c[0]);
    const d = /^([A-Z][a-z]+) (\d{1,2}), (\d{4})$/.exec(c[c.length - 1]);
    if (m && d && !/RC/.test(c[0])) found[m[1]] = `${d[3]}-${LONG_MONTHS[d[1]]}-${d[2].padStart(2, '0')}`;
  }
  assert.deepEqual(Object.fromEntries(pick('dotnet')), found);
  assert.equal(Object.keys(found).length, 13);
});

test('dotnet: the Microsoft Lifecycle page gives the same end dates, within one day (it counts in another time zone)', async () => {
  const learn = {};
  for (const c of rowsOf(await page('dotnet-learn'))) {
    const m = /^\.NET(?: Core)? (\d+(?:\.\d+)?)(?: \(LTS\))?$/.exec(c[0]);
    const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4}) /.exec(c[2] ?? '');
    // The Lifecycle page writes ".NET 6.0" where the policy page writes ".NET 6".
    if (m && d) learn[/^([5-9]|\d{2})\.0$/.test(m[1]) ? m[1].split('.')[0] : m[1]] = `${d[3]}-${d[1].padStart(2, '0')}-${d[2].padStart(2, '0')}`;
  }
  assert.ok(Object.keys(learn).length >= 12);
  for (const [version, date] of Object.entries(learn)) {
    const r = findRelease('dotnet', version);
    assert.ok(r, version);
    assert.ok(Math.abs(parseDay(date) - parseDay(r.end)) <= 1, `${version}: ${date} against ${r.end}`);
  }
});

test('php: every branch and its end of security support or end of life is the one of the two pages', async () => {
  const found = {};
  const conv = (s) => {
    const d = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{4})$/.exec(s);
    return `${d[3]}-${MONTHS[d[2]]}-${d[1].padStart(2, '0')}`;
  };
  for (const c of rowsOf(await page('php-supported'))) if (/^\d\.\d$/.test(c[0]) && c.length === 4) found[c[0]] = conv(c[3]);
  for (const c of rowsOf(await page('php-eol'))) if (/^\d\.\d$/.test(c[0]) && /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(c[1])) found[c[0]] = conv(c[1]);
  assert.deepEqual(Object.fromEntries(pick('php')), found);
  for (const r of RELEASES.php) assert.equal(r.source, ['8.2', '8.3', '8.4', '8.5'].includes(r.version) ? 'php-supported' : 'php-eol', r.version);
});

test('php: the end of support is the end of security support, as the page says the branch then reaches its end of life', async () => {
  const text = await page('php-supported');
  assert.ok(has(text, FACTS.php.text));
  assert.ok(has(text, 'each branch is then supported for two additional years for critical security issues only'));
  const rows = rowsOf(text).filter((c) => /^8\.\d$/.test(c[0]));
  assert.equal(rows.length, 4);
  for (const c of rows) assert.ok(c[3].startsWith('31 Dec'), c[0]);
});

test('ruby: every branch and its end of life is the one of the page, an expected date is marked, and TBD is no date', async () => {
  const t = (await page('ruby')).split('\n');
  const found = {};
  for (let i = 0; i < t.length; i += 1) {
    const m = /^Ruby (\d+\.\d+)(?:\.\d+)?$/.exec(t[i]);
    if (!m) continue;
    const eol = t.slice(i + 1, i + 12).find((l) => l.startsWith('EOL: ')).slice(5);
    const d = /^(\d{4}-\d{2}-\d{2})( \(expected\))?$/.exec(eol);
    found[m[1]] = d ? [d[1], d[2] ? 'expected' : 'end'] : [null, 'unannounced'];
  }
  assert.deepEqual(Object.fromEntries(RELEASES.ruby.map((r) => [r.version, [r.end, r.kind]])), found);
  assert.deepEqual(found['3.3'], ['2027-03-31', 'expected']);
  assert.deepEqual(found['4.0'], [null, 'unannounced']);
});

test('go: the release days are the ones of the page, and the end of each release is the day of the second newer release', async () => {
  const days = {};
  for (const l of (await page('go')).split('\n')) {
    const m = /^go(1(?:\.\d+)?)(?:\.0)? \(released (\d{4}-\d{2}-\d{2})\)$/.exec(l);
    if (m) days[m[1] === '1' ? '1.0' : m[1]] = m[2];
  }
  assert.deepEqual(GO_RELEASE_DAYS, days);
  assert.equal(Object.keys(days).length, 28);
  for (const r of RELEASES.go) {
    const n = Number(r.version.split('.')[1]);
    const later = days[`1.${n + 2}`];
    assert.equal(r.end, later ?? null, r.version);
    assert.equal(r.kind, later ? 'policy' : 'unannounced', r.version);
  }
  assert.equal(entries('go')['1.27'].end, null);
  assert.equal(entries('go')['1.26'].end, null);
  assert.equal(entries('go')['1.25'].end, days['1.27']);
});

test('go: the policy sentence that the end dates follow is on the saved page', async () => {
  const text = await page('go');
  assert.ok(has(text, 'Each major Go release is supported until there are two newer major releases.'));
  assert.ok(has(text, 'For example, Go 1.5 was supported until the Go 1.7 release, and Go 1.6 was supported until the Go 1.8 release.'));
  assert.equal(entries('go')['1.5'].end, GO_RELEASE_DAYS['1.7']);
  assert.equal(entries('go')['1.6'].end, GO_RELEASE_DAYS['1.8']);
});

test('java: every Temurin row is on the page: LTS rows are a minimum, the other rows end in the month the page gives', async () => {
  const found = {};
  for (const c of rowsOf(await page('java-temurin'))) {
    const m = /^Java (\d+)( \(LTS\))?$/.exec(c[0]);
    if (!m || c.length !== 5) continue;
    const d = /^(At least )?([A-Z][a-z]{2}) (\d{4})$/.exec(c[4]);
    found[m[1]] = [`${d[3]}-${MONTHS[d[2]]}`, d[1] ? 'minimum' : 'end', Boolean(m[2]), c[3].startsWith('EOSL')];
  }
  assert.deepEqual(Object.fromEntries(RELEASES.java.map((r) => [r.version, [r.end, r.kind]])), Object.fromEntries(Object.entries(found).map(([v, x]) => [v, [x[0], x[1]]])));
  for (const [version, x] of Object.entries(found)) {
    assert.equal(x[2], x[1] === 'minimum', `Java ${version}: a minimum is for LTS rows`);
    if (x[3]) assert.equal(x[1], 'end', `Java ${version}: EOSL`);
  }
  for (const r of RELEASES.java) assert.equal(r.precision, 'month');
  assert.deepEqual(Object.keys(found).sort((a, b) => a - b), ['8', '11', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27']);
});

test('java: Java 9 to 10 and 12 to 15 are not on the page, so they are not in the data', () => {
  for (const v of ['7', '9', '10', '12', '13', '14', '15', '28']) assert.equal(findRelease('java', v), null, v);
});

test('facts: every quoted sentence is on its saved page, word for word, and holds no year and no mention of a tool that wrote it', async () => {
  for (const [runtime, fact] of Object.entries(FACTS)) {
    assert.ok(SOURCES.some((s) => s.id === fact.source), runtime);
    assert.ok(has(await page(fact.source), fact.text), `${runtime}: "${fact.text}"`);
    assert.ok(fact.section.length > 3, runtime);
    assert.doesNotMatch(fact.text, /\b(?:19|20)\d{2}\b/, runtime);
    assert.doesNotMatch(fact.text, WRITTEN, runtime);
    assert.ok(/\.$/.test(fact.text), `${runtime} ends like a sentence`);
  }
  for (const [key, fact] of Object.entries(NOTES)) {
    assert.ok(has(await page(fact.source), fact.text), `${key}: "${fact.text}"`);
    assert.doesNotMatch(fact.text, /\b(?:19|20)\d{2}\b/, key);
  }
  assert.deepEqual(Object.keys(FACTS).sort(), Object.keys(RUNTIMES).sort());
});

test('lifecycle: versions are unique, dates are real days or months, and kinds and precisions are known', () => {
  let total = 0;
  for (const [runtime, list] of Object.entries(RELEASES)) {
    assert.deepEqual(new Set(list.map((r) => r.version)).size, list.length, runtime);
    for (const r of list) {
      total += 1;
      assert.equal(r.runtime, runtime);
      assert.ok(['day', 'month'].includes(r.precision), `${runtime} ${r.version}`);
      assert.ok(['end', 'expected', 'policy', 'minimum', 'unannounced'].includes(r.kind), `${runtime} ${r.version}`);
      assert.ok(SOURCES.some((s) => s.id === r.source), `${runtime} ${r.version}`);
      if (r.end === null) assert.equal(r.kind, 'unannounced');
      else if (r.precision === 'day') assert.notEqual(parseDay(r.end), null, `${runtime} ${r.version}: ${r.end}`);
      else assert.notEqual(parseMonth(r.end), null, `${runtime} ${r.version}: ${r.end}`);
    }
  }
  assert.ok(total >= 130, `${total} releases`);
  assert.deepEqual(Object.keys(RELEASES).sort(), Object.keys(RUNTIMES).sort());
});

test('lifecycle: names and lookups', () => {
  assert.equal(displayName('node', '18'), 'Node.js 18');
  assert.equal(displayName('dotnet', '8'), '.NET 8');
  assert.equal(displayName('dotnet', '3.1'), '.NET Core 3.1');
  assert.equal(displayName('python', '3.9'), 'Python 3.9');
  assert.equal(findRelease('node', '18').end, '2025-04-30');
  assert.equal(findRelease('node', '99'), null);
  assert.equal(findRelease('cobol', '1'), null);
});
