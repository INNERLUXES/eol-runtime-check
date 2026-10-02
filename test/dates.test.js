import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayNumber, daysText, formatDay, parseDay, parseMonth, todayText } from '../src/index.js';

test('dates: a real calendar day is read, and a day number moves by one for each day', () => {
  assert.equal(parseDay('1970-01-01'), 0);
  assert.equal(parseDay('1970-01-02'), 1);
  assert.equal(parseDay('2026-03-01') - parseDay('2026-02-28'), 1);
  assert.equal(parseDay('2027-01-01') - parseDay('2026-01-01'), 365);
  assert.equal(parseDay('2029-01-01') - parseDay('2028-01-01'), 366);
});

test('dates: leap days, the end of a month and the end of a year are checked against the calendar', () => {
  assert.notEqual(parseDay('2028-02-29'), null);
  assert.equal(parseDay('2027-02-29'), null);
  assert.equal(parseDay('2100-02-29'), null);
  assert.notEqual(parseDay('2000-02-29'), null);
  assert.equal(parseDay('2026-04-31'), null);
  assert.notEqual(parseDay('2026-12-31'), null);
});

test('dates: text that is not a day in the form YYYY-MM-DD is refused', () => {
  for (const bad of ['', '2026-1-1', '26-01-01', '2026/01/01', ' 2026-01-01', '2026-01-01 ', '2026-13-01', '2026-00-10', '2026-01-00', '2026-01-32', '1969-12-31', '3000-01-01', '2026-01-01T00:00:00Z', 'today', '2026-01', null, undefined]) {
    assert.equal(parseDay(bad), null, String(bad));
  }
});

test('dates: a month is the first day of it and the first day of the next, across the end of a year', () => {
  assert.equal(parseMonth('2026-03').next - parseMonth('2026-03').first, 31);
  assert.equal(parseMonth('2026-02').next - parseMonth('2026-02').first, 28);
  assert.equal(parseMonth('2028-02').next - parseMonth('2028-02').first, 29);
  assert.equal(parseMonth('2026-12').next, parseDay('2027-01-01'));
  for (const bad of ['2026-13', '2026-00', '2026-3', '2026-03-01', '', 'x']) assert.equal(parseMonth(bad), null, bad);
});

test('dates: a day number is written back as the same day, in UTC', () => {
  for (const text of ['1970-01-01', '2000-02-29', '2026-03-01', '2999-12-31']) assert.equal(formatDay(parseDay(text)), text);
  assert.equal(dayNumber(2026, 3, 1), parseDay('2026-03-01'));
});

test('dates: the current day is taken in UTC, so a late evening elsewhere does not move it', () => {
  assert.equal(todayText(new Date('2026-03-01T23:59:59Z')), '2026-03-01');
  assert.equal(todayText(new Date('2026-03-02T00:00:00Z')), '2026-03-02');
  assert.match(todayText(), /^\d{4}-\d{2}-\d{2}$/);
});

test('dates: days are counted with a singular and a thousands separator', () => {
  assert.equal(daysText(0), '0 days');
  assert.equal(daysText(1), '1 day');
  assert.equal(daysText(2), '2 days');
  assert.equal(daysText(1189), '1,189 days');
});
