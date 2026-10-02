// Calendar days as whole numbers, so that every difference is exact and no time zone or clock change can move it. A day
// is the number of days since 1970-01-01 in UTC. The report date comes from --today (or from the clock, in UTC).

const DAY_MS = 86400000;
const MIN_YEAR = 1970;
const MAX_YEAR = 2999;

export const dayNumber = (year, month, day) => Math.round(Date.UTC(year, month - 1, day) / DAY_MS);

// "YYYY-MM-DD" to a day number, or null when it is not a real calendar day in 1970 to 2999.
export function parseDay(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text));
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12 || day < 1) return null;
  const n = dayNumber(year, month, day);
  const back = new Date(n * DAY_MS);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() + 1 !== month || back.getUTCDate() !== day) return null;
  return n;
}

// "YYYY-MM" to the first day of the month and the first day of the next month, or null.
export function parseMonth(text) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(text));
  if (!m) return null;
  const [year, month] = [Number(m[1]), Number(m[2])];
  if (year < MIN_YEAR || year > MAX_YEAR || month < 1 || month > 12) return null;
  return { first: dayNumber(year, month, 1), next: month === 12 ? dayNumber(year + 1, 1, 1) : dayNumber(year, month + 1, 1) };
}

export function formatDay(n) {
  const d = new Date(n * DAY_MS);
  const pad = (v, width = 2) => String(v).padStart(width, '0');
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// The current date in UTC, as "YYYY-MM-DD".
export const todayText = (now = new Date()) => formatDay(Math.floor(now.getTime() / DAY_MS));

// "1 day", "2 days", "1,200 days"
export const daysText = (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'day' : 'days'}`;
