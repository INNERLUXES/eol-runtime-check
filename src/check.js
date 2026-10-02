// Reads the folder, works out for each declared version where it stands against the saved lifecycle data on the report
// date, and returns one report. docs/method.md gives the rule behind every finding. The tool reads the files named in
// docs/inputs.md and nothing else, and opens no connection.

import { DEFAULTS, FACTS, NOTES, displayName, findRelease, sourceLabel, sourceUrl } from './lifecycle.js';
import { daysText, parseDay, parseMonth, todayText } from './dates.js';
import { InputError } from './errors.js';
import { FINDINGS, ORDER, RANK, SEVERITIES, meetsThreshold, safeText } from './rules.js';
import { READ_LIMITS, readDeclarations } from './readers.js';
import { SCAN_LIMITS, scanFolder } from './scan.js';

export { FINDINGS, RANK, SEVERITIES, meetsThreshold, safeText };

const BY_ID = Object.fromEntries(FINDINGS.map((f) => [f.id, f]));

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

// Checks the options and fills in the defaults. Throws InputError for a value that cannot be used.
export function readOptions(options = {}) {
  const whole = (name, value, fallback, min, max) => {
    if (value === undefined || value === null) return fallback;
    const text = String(value);
    if (!/^\d{1,5}$/.test(text) || Number(text) < min || Number(text) > max) throw new InputError(`${name} takes a whole number from ${min} to ${max}, not ${safeText(text, 40)}`);
    return Number(text);
  };
  const soonDays = whole('--soon-days', options.soonDays, DEFAULTS.soonDays, 0, 3650);
  const maxDepth = whole('--max-depth', options.maxDepth, SCAN_LIMITS.maxDepth, 0, 32);
  const today = options.today ?? todayText();
  const todayDay = parseDay(today);
  if (todayDay === null) throw new InputError(`--today takes a calendar day written YYYY-MM-DD, not ${safeText(today, 40)}`);
  const skip = options.skip ?? [];
  if (!Array.isArray(skip) || skip.length > 50) throw new InputError('--skip can be given at most 50 times');
  for (const name of skip) {
    if (typeof name !== 'string' || name === '' || name.length > 255 || /[/\\\u0000-\u001f\u007f]/.test(name)) throw new InputError('--skip takes a folder name of 1 to 255 characters, without a slash or a control character');
  }
  return { soonDays, maxDepth, today, todayDay, skip, defaultSkip: options.defaultSkip !== false, dates: options.dates !== false };
}

// Where a release stands on a day. Every day is a whole number (see dates.js), and a difference is exact.
//   status   past | soon | supported | minimum | unannounced
// An end date is the first day without support, so a release is past its end on the end date itself; docs/method.md says
// why. A date that the page gives as a month only is read as that whole month: before it begins the release ends "at the
// earliest" on its first day, during it the release ends this month, and after it the release has ended.
export function standing(release, todayDay, soonDays) {
  if (release.end === null || release.kind === 'unannounced') return { status: 'unannounced' };
  if (release.precision === 'month') {
    const m = parseMonth(release.end);
    if (release.kind === 'minimum') return { status: 'minimum', passed: todayDay >= m.next, days: Math.abs(m.next - todayDay) };
    if (todayDay >= m.next) return { status: 'past', daysPast: todayDay - m.next + 1, monthOnly: true };
    if (todayDay >= m.first) return { status: 'soon', thisMonth: true, monthOnly: true };
    const daysLeft = m.first - todayDay;
    return { status: daysLeft <= soonDays ? 'soon' : 'supported', daysLeft, monthOnly: true };
  }
  const end = parseDay(release.end);
  if (todayDay >= end) return { status: 'past', daysPast: todayDay - end };
  const daysLeft = end - todayDay;
  return { status: daysLeft <= soonDays ? 'soon' : 'supported', daysLeft };
}

const ID_OF = { past: 'runtime-past-support', soon: 'runtime-ending-soon', supported: 'runtime-supported', unannounced: 'runtime-supported', minimum: 'runtime-vendor-minimum' };

const FIX = {
  past: (d) => (d.range ? 'Raise the lower limit to a release that is still supported and move the code to it; then run the check again.' : 'Move to a release that is still supported and change this file to name it; then run the check again.'),
  soon: () => 'Plan the move to a release that will still be supported after this one ends.',
  ok: () => 'Nothing to fix now.',
  notInData: () => 'Look the version up on the lifecycle page of the vendor; the tool does not guess a date.',
  unreadable: () => 'Write the version in a form the tool reads (docs/inputs.md lists them), or check it by hand.',
  fileProblem: () => 'Fix the file or its access, or leave it out; the tool read nothing from it.',
  nothing: () => 'Run the tool on the folder of a project; docs/inputs.md lists the files it reads.'
};

function quoteFor(runtime, extra = []) {
  const fact = FACTS[runtime];
  const list = [fact, ...extra].filter(Boolean);
  return list.map((f) => ({ page: sourceLabel(f.source), section: f.section, url: sourceUrl(f.source), quote: f.text }));
}

function finding(id, subject, message, fix, extra = {}) {
  return {
    id,
    severity: BY_ID[id].severity,
    subject: safeText(subject, 200),
    file: safeText(extra.file ?? '', 500),
    where: safeText(extra.where ?? '', 200),
    declared: safeText(extra.declared ?? '', 200),
    message: safeText(message, 2000),
    fix,
    details: extra.details ?? {},
    manual: extra.manual ?? []
  };
}

// What a declaration says, in words: 'package.json engines.node ">=18" allows' or 'Dockerfile FROM line 3 "php:7.4-apache" names'.
function leadOf(d) {
  const base = d.file.slice(d.file.lastIndexOf('/') + 1).toLowerCase();
  const loc = d.where.toLowerCase() === base ? `${d.file} "${d.raw}"` : `${d.file} ${d.where} "${d.raw}"`;
  return { loc, verb: d.range ? 'allows' : 'names', lowestWord: d.range ? ' as its lowest version' : '' };
}

function endPhrase(release, st, dates) {
  const shown = dates ? release.end : null;
  switch (st.status) {
    case 'past':
      if (st.monthOnly) return `ended at least ${daysText(st.daysPast)} ago${dates ? ` (in ${shown})` : ''}, in the month the page gives`;
      return st.daysPast === 0 ? `ended today${dates ? ` (${shown})` : ''}` : `ended ${daysText(st.daysPast)} ago${dates ? ` (on ${shown})` : ''}`;
    case 'soon':
      if (st.thisMonth) return `ends this month${dates ? ` (${shown})` : ''}; the page gives the month only`;
      if (st.monthOnly) return `ends in ${daysText(st.daysLeft)} at the earliest${dates ? ` (${shown})` : ''}; the page gives the month only`;
      return `ends in ${daysText(st.daysLeft)}${dates ? ` (on ${shown})` : ''}`;
    case 'supported':
      return st.monthOnly ? `ends in ${daysText(st.daysLeft)} at the earliest${dates ? ` (${shown})` : ''}; the page gives the month only` : `ends in ${daysText(st.daysLeft)}${dates ? ` (on ${shown})` : ''}`;
    default:
      return '';
  }
}

function releaseNote(release) {
  if (release.kind === 'expected') return ' The page marks this date as expected.';
  if (release.kind === 'policy') return ' The date is the day the second newer major release came out, which is how the policy sentence reads.';
  return '';
}

// One finding for one declaration, from the data and the report date.
export function judge(d, { todayDay, soonDays, dates }) {
  const extra = { file: d.file, where: d.where, declared: d.raw };
  if (d.key === null) {
    return finding('version-unreadable', d.file, `${leadOf(d).loc}: the version could not be read: ${d.reason}.`, FIX.unreadable(), { ...extra, details: { runtime: d.runtime, reason: d.reason } });
  }
  const name = displayName(d.runtime, d.key);
  const release = findRelease(d.runtime, d.key);
  const lead = leadOf(d);
  if (!release) {
    return finding('version-not-in-data', name, `${lead.loc} ${lead.verb} ${name}${lead.lowestWord}, which is not on the saved lifecycle page, so no date is read.`, FIX.notInData(), { ...extra, details: { runtime: d.runtime, key: d.key, lowest: d.lowest, range: d.range }, manual: quoteFor(d.runtime) });
  }
  const st = standing(release, todayDay, soonDays);
  const details = { runtime: d.runtime, key: d.key, lowest: d.lowest, range: d.range, kind: release.kind, precision: release.precision, end: dates ? release.end : null, daysLeft: st.daysLeft ?? null, daysPast: st.daysPast ?? null, source: sourceUrl(release.source) };
  const manual = quoteFor(d.runtime, d.runtime === 'java' ? [release.kind === 'minimum' ? NOTES.javaMinimum : NOTES.javaEndOfService] : []);
  const id = ID_OF[st.status];
  let message;
  if (st.status === 'past') {
    message = `${lead.loc} ${lead.verb} ${name}${lead.lowestWord}, which is past its end of support: it ${endPhrase(release, st, dates)}.${releaseNote(release)}`;
  } else if (st.status === 'soon') {
    message = `${lead.loc} ${lead.verb} ${name}${lead.lowestWord}, which is still supported but whose support ${endPhrase(release, st, dates)}. That is within the ${plural(soonDays, 'day')} of --soon-days.${releaseNote(release)}`;
  } else if (st.status === 'supported') {
    message = `${lead.loc} ${lead.verb} ${name}${lead.lowestWord}, which is supported; its support ${endPhrase(release, st, dates)}.${releaseNote(release)}`;
  } else if (st.status === 'minimum') {
    const until = dates ? release.end : 'the month on the saved page';
    message = st.passed
      ? `${lead.loc} ${lead.verb} ${name}${lead.lowestWord}, an LTS release that Eclipse Temurin builds until at least ${until}; that minimum is behind the report date and the page states no end.`
      : `${lead.loc} ${lead.verb} ${name}${lead.lowestWord}, an LTS release that Eclipse Temurin builds until at least ${until}; the page states no end.`;
  } else {
    message = `${lead.loc} ${lead.verb} ${name}${lead.lowestWord}, which is supported; the saved page gives no end date yet.`;
  }
  const fix = st.status === 'past' ? FIX.past(d) : st.status === 'soon' ? FIX.soon() : FIX.ok();
  return finding(id, name, message, fix, { ...extra, details, manual });
}

const byFinding = (a, b) => ORDER[a.id] - ORDER[b.id] || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0) || (a.where < b.where ? -1 : a.where > b.where ? 1 : 0) || (a.declared < b.declared ? -1 : a.declared > b.declared ? 1 : 0);

function gate(counts, failOn) {
  const parts = [];
  if (counts.error > 0) parts.push(plural(counts.error, 'error'));
  if (failOn === 'warning' && counts.warning > 0) parts.push(plural(counts.warning, 'warning'));
  const fail = parts.length > 0;
  return { failOn, pass: !fail, reason: fail ? parts.join(' and ') : '' };
}

function notesFor(scan, read) {
  const notes = [];
  const s = scan.stats;
  if (s.links > 0) notes.push(`${plural(s.links, 'symbolic link')} in the folder ${s.links === 1 ? 'was' : 'were'} not followed.`);
  const skipped = Object.entries(s.skipped).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (skipped.length > 0) notes.push(`${plural(skipped.reduce((n, [, c]) => n + c, 0), 'folder')} skipped by name (${skipped.map(([k, c]) => `${safeText(k, 40)} ${c}`).join(', ')}); --skip and --no-default-skip change this.`);
  if (s.tooDeep > 0) notes.push(`${plural(s.tooDeep, 'folder')} below ${plural(scan.limits.maxDepth, 'level')} ${s.tooDeep === 1 ? 'was' : 'were'} not read; --max-depth changes this.`);
  if (s.entryLimit) notes.push(`The walk stopped after ${scan.limits.maxEntries.toLocaleString('en-US')} entries, so part of the folder was not looked at.`);
  if (s.fileLimit) notes.push(`More than ${scan.limits.maxFiles.toLocaleString('en-US')} files of interest were found; the rest were not read.`);
  if (read.truncated) notes.push(`The tool stopped after ${READ_LIMITS.maxDeclarations.toLocaleString('en-US')} declarations.`);
  return notes;
}

// Judges a list of declarations. Pure: no file is read. Returns the findings in report order.
export function judgeAll(declarations, opts) {
  return declarations.map((d) => judge(d, opts));
}

// Checks a folder and returns the report. options: today, soonDays, maxDepth, skip, defaultSkip, dates, failOn, version.
export async function checkFolder(root, { failOn = 'error', version = '0.0.0', limits = READ_LIMITS, ...options } = {}) {
  const o = readOptions(options);
  const scan = await scanFolder(root, { maxDepth: o.maxDepth, skip: o.skip, defaultSkip: o.defaultSkip, ...(options.scanLimits ?? {}) });
  const read = await readDeclarations(scan.found, limits);
  const findings = judgeAll(read.declarations, { todayDay: o.todayDay, soonDays: o.soonDays, dates: o.dates });
  for (const p of [...scan.stats.unreadable, ...read.problems]) {
    findings.push(finding('file-not-read', safeText(p.file, 200), `${safeText(p.file, 200)} ${p.reason}.`, FIX.fileProblem(), { file: p.file, details: { reason: p.reason } }));
  }
  if (read.declarations.length === 0) {
    findings.push(finding('no-runtime-found', scan.name, `No declared runtime or framework version was found in ${plural(read.filesRead, 'file')} read (${plural(scan.found.length, 'file')} of interest, ${plural(scan.stats.folders, 'folder')} looked at).`, FIX.nothing(), { details: { files: scan.found.length, folders: scan.stats.folders } }));
  }
  findings.sort(byFinding);
  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return {
    tool: 'eol-runtime-check',
    version,
    target: scan.name,
    today: o.dates ? o.today : null,
    options: { soonDays: o.soonDays, maxDepth: o.maxDepth, skip: o.skip, defaultSkip: o.defaultSkip, dates: o.dates, failOn },
    input: { folders: scan.stats.folders, entries: scan.stats.entries, files: scan.found.length, filesRead: read.filesRead, declarations: read.declarations.length },
    findings,
    notes: notesFor(scan, read),
    counts,
    gate: gate(counts, failOn)
  };
}
