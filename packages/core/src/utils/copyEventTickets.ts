import { isoToZonedInput, zonedInputToIso } from './zonedDateTime';

/**
 * Carrying an event's ticket setup onto a copy of it on another date.
 *
 * Sales windows and promo codes are both tied to the event's date: "advance
 * sales end the night before", "TEAMOCT426". Copied verbatim onto a later
 * event, the windows would already be closed and the codes would collide with
 * the originals (codes are unique across all events). So both are moved by the
 * number of calendar days between the two events, in each event's own timezone.
 */

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function localDate(iso: string, timeZone: string): { y: number; m: number; d: number } {
  const [y, m, d] = isoToZonedInput(iso, timeZone).slice(0, 10).split('-').map(Number);
  return { y, m, d };
}

function dayNumber({ y, m, d }: { y: number; m: number; d: number }): number {
  return Date.UTC(y, m - 1, d) / 86400000;
}

/** The event date as a code suffix, e.g. Oct 4 2026 → "OCT426". */
export function eventCodeSuffix(startsAt: string, timeZone: string): string {
  const { y, m, d } = localDate(startsAt, timeZone);
  return `${MONTHS[m - 1]}${d}${String(y % 100).padStart(2, '0')}`;
}

/**
 * The code to use on the copy: the original's date suffix swapped for the new
 * event's ("TEAMOCT426" → "TEAMNOV126"), or the new suffix appended when the
 * original doesn't end in its event's date.
 */
export function promoCodeForCopy(
  code: string,
  from: { startsAt: string; timeZone: string },
  to: { startsAt: string; timeZone: string }
): string {
  const oldSuffix = eventCodeSuffix(from.startsAt, from.timeZone);
  const upper = code.toUpperCase();
  const base = upper.endsWith(oldSuffix) && upper.length > oldSuffix.length
    ? upper.slice(0, -oldSuffix.length)
    : upper;
  return `${base}${eventCodeSuffix(to.startsAt, to.timeZone)}`;
}

/**
 * A sales start or end moved to the same wall-clock time, the same number of
 * days before or after the new event as it was the old one. Kept on the wall
 * clock rather than shifted by milliseconds so "11:59pm the night before"
 * stays 11:59pm across a DST change.
 */
export function shiftSalesTime(
  iso: string | null,
  from: { startsAt: string; timeZone: string },
  to: { startsAt: string; timeZone: string }
): string | null {
  if (!iso) return null;
  const days = dayNumber(localDate(to.startsAt, to.timeZone)) - dayNumber(localDate(from.startsAt, from.timeZone));

  const wall = isoToZonedInput(iso, from.timeZone);
  const { y, m, d } = localDate(iso, from.timeZone);
  const shifted = new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  return zonedInputToIso(`${shifted}${wall.slice(10)}`, to.timeZone, new Date(iso).getUTCSeconds());
}
