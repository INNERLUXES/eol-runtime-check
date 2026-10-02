// Report formats: text for a terminal, Markdown for a pull request or job summary, JSON for other tools, CSV for a
// spreadsheet. Findings are listed in the order of the checks, and within a check by file. A finding names the file, the
// declared value, the lowest version it allows, the days left or gone, a fix, and the sentence of the lifecycle page
// that it quotes, with the address of the page. With --no-dates the report holds no calendar date at all, only counts of
// days. Text that comes from the folder (names, declared values) has been cleaned before it gets here.

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

function countsLine(c) {
  return `${c.error} error, ${c.warning} warning, ${c.info} info`;
}

function gateLine(r) {
  return r.gate.pass ? `GATE: PASS (--fail-on ${r.gate.failOn})` : `GATE: FAIL - ${r.gate.reason}`;
}

// "7 files of interest in 3 folders, 11 declarations"
function inputLine(r) {
  const i = r.input;
  return `${plural(i.files, 'file')} of interest in ${plural(i.folders, 'folder')}, ${plural(i.declarations, 'declaration')}`;
}

const dateLine = (r) => (r.today === null ? 'report date: left out (--no-dates)' : `report date: ${r.today}`);

export function toText(r) {
  const lines = [`eol-runtime-check: ${r.target}`, `read: ${inputLine(r)}`, dateLine(r), `findings: ${countsLine(r.counts)}`];
  if (!r.findings.length) lines.push('', 'no findings');
  for (const f of r.findings) {
    lines.push('', `${f.severity.toUpperCase().padEnd(7)}  ${f.id}  ${f.subject}`);
    lines.push(`         ${f.message}`);
    lines.push(`         fix: ${f.fix}`);
    for (const m of f.manual) lines.push(`         source (${m.page}, ${m.section}): "${m.quote}"`, `           ${m.url}`);
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`note: ${note}`);
  lines.push('', gateLine(r));
  return lines.join('\n') + '\n';
}

// A Markdown table cell: backslashes and pipes escaped, line breaks flattened, and <, > and & written as entities, so
// text from the folder cannot break the table or be read as HTML.
export function mdCell(t) {
  return String(t)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n|\r/g, ' ');
}

export function toMarkdown(r) {
  const lines = [`## eol-runtime-check: ${countsLine(r.counts)}`, '', `${mdCell(r.target)}, ${mdCell(inputLine(r))}. ${mdCell(dateLine(r).charAt(0).toUpperCase() + dateLine(r).slice(1))}.`];
  if (!r.findings.length) lines.push('', 'No findings.');
  else {
    lines.push('', '| Severity | Check | About | Message | Fix | Source |', '| --- | --- | --- | --- | --- | --- |');
    for (const f of r.findings) {
      const source = f.manual.map((m) => `[${mdCell(`${m.page}, ${m.section}`)}](${m.url}): "${mdCell(m.quote)}"`).join('<br>');
      lines.push(`| ${f.severity} | ${mdCell(f.id)} | ${mdCell(f.subject)} | ${mdCell(f.message)} | ${mdCell(f.fix)} | ${source || '-'} |`);
    }
  }
  if (r.notes.length) lines.push('');
  for (const note of r.notes) lines.push(`- ${mdCell(note)}`);
  lines.push('', r.gate.pass ? `**Gate passed** (--fail-on ${r.gate.failOn}).` : `**Gate failed:** ${mdCell(r.gate.reason)}.`);
  return lines.join('\n') + '\n';
}

export function toJson(r) {
  return JSON.stringify(r, null, 2) + '\n';
}

// RFC 4180 quoting, and a leading quote on cells a spreadsheet would read as a formula.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// One row per finding. days_left and days_past are whole days, end is the end date as the saved page gives it (empty
// with --no-dates). source_page and source_url name the first sentence the finding quotes; the JSON report has all.
export function toCsv(r) {
  const rows = [['severity', 'id', 'subject', 'file', 'where', 'declared', 'days_left', 'days_past', 'end', 'message', 'fix', 'source_page', 'source_url']];
  for (const f of r.findings) {
    const m = f.manual[0];
    const d = f.details;
    rows.push([f.severity, f.id, f.subject, f.file, f.where, f.declared, d.daysLeft ?? '', d.daysPast ?? '', d.end ?? '', f.message, f.fix, m ? m.page : '', m ? m.url : '']);
  }
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
