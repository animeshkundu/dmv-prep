/**
 * Return the calendar day in the requested timezone.
 *
 * Calendar days must not be derived from `toISOString()`: that is always UTC
 * and changes the answer's day for learners near a UTC boundary.
 */
export function localDayKey(date: Date, timeZone?: string): string {
  if (Number.isNaN(date.getTime())) throw new RangeError('Invalid date.');

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Move a local calendar-day key without converting the learner's instant to UTC. */
export function shiftDayKey(day: string, offset: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isInteger(offset)) {
    throw new RangeError('Invalid local day key or offset.');
  }
  const [year, month, date] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year!, month! - 1, date! + offset));
  const shiftedYear = String(shifted.getUTCFullYear()).padStart(4, '0');
  const shiftedMonth = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const shiftedDate = String(shifted.getUTCDate()).padStart(2, '0');
  return `${shiftedYear}-${shiftedMonth}-${shiftedDate}`;
}
