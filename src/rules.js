// The checks: every finding id and its severity. docs/method.md gives the rule of each one. An id, once released, keeps
// its meaning, because pipelines read it from the JSON and CSV reports.
//
// Severity is the tool's own mapping, because the lifecycle pages give dates and no scale: an error is a declared
// version that is past its end of support; a warning is one whose support ends within --soon-days; info is everything
// else (a version that is supported, a version or a file the tool could not read, a version that is not in the data),
// and it never fails a run.

export const SEVERITIES = ['error', 'warning', 'info'];
export const RANK = { error: 3, warning: 2, info: 1 };

export const FINDINGS = [
  // ---- errors
  { id: 'runtime-past-support', severity: 'error' },

  // ---- warnings
  { id: 'runtime-ending-soon', severity: 'warning' },

  // ---- info: never fails the run
  { id: 'runtime-supported', severity: 'info' },
  { id: 'runtime-vendor-minimum', severity: 'info' },
  { id: 'version-not-in-data', severity: 'info' },
  { id: 'version-unreadable', severity: 'info' },
  { id: 'file-not-read', severity: 'info' },
  { id: 'no-runtime-found', severity: 'info' }
];

export const ORDER = Object.fromEntries(FINDINGS.map((f, i) => [f.id, i]));

export const meetsThreshold = (severity, failOn) => RANK[severity] >= RANK[failOn];

// C0 and C1 control characters, line and paragraph separators, and the Unicode direction controls.
const UNSAFE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029\\u200e\\u200f\\u202a-\\u202e\\u2066-\\u2069]', 'g');

// Text that comes from a file or from a name goes through this before it reaches a message: control, line separator
// and direction characters become a space, and the length is cut.
export function safeText(value, max = 200) {
  const text = String(value).replace(UNSAFE, ' ');
  return text.length > max ? `${text.slice(0, Math.max(0, max - 3))}...` : text;
}
