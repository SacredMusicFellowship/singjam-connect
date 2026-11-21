import { describe, it, expect } from 'vitest';
import { eventCodeSuffix, promoCodeForCopy, shiftSalesTime } from './copyEventTickets';

const LA = 'America/Los_Angeles';
// The Oct 4 2026 Starry Plough event: 2:30pm PDT.
const OCT = { startsAt: '2026-10-04T21:30:00+00:00', timeZone: LA };
// A copy on Sunday Nov 1 2026, after the fall-back to PST.
const NOV = { startsAt: '2026-11-01T22:30:00.000Z', timeZone: LA };

describe('eventCodeSuffix', () => {
  it('formats the local date as month, unpadded day, two-digit year', () => {
    expect(eventCodeSuffix(OCT.startsAt, LA)).toBe('OCT426');
    expect(eventCodeSuffix('2026-12-13T22:30:00.000Z', LA)).toBe('DEC1326');
  });

  it('uses the event timezone, not UTC', () => {
    // 8pm Oct 4 in LA is already Oct 5 in UTC.
    expect(eventCodeSuffix('2026-10-05T03:00:00.000Z', LA)).toBe('OCT426');
  });
});

describe('promoCodeForCopy', () => {
  it("swaps the original event's date for the copy's", () => {
    expect(promoCodeForCopy('TEAMOCT426', OCT, NOV)).toBe('TEAMNOV126');
  });

  it('appends the date to a code without one', () => {
    expect(promoCodeForCopy('FRIENDS', OCT, NOV)).toBe('FRIENDSNOV126');
  });

  it('does not strip a code that is only the date', () => {
    expect(promoCodeForCopy('OCT426', OCT, NOV)).toBe('OCT426NOV126');
  });
});

describe('shiftSalesTime', () => {
  it('keeps the wall-clock time across a DST change', () => {
    // Advance sales through 11:59:59pm PDT the night before Oct 4…
    // …become 11:59:59pm PDT the night before Nov 1 (Oct 31, still PDT).
    expect(shiftSalesTime('2026-10-04T06:59:59.000Z', OCT, NOV)).toBe('2026-11-01T06:59:59.000Z');
    // A day-of window opening at 9am Oct 4 PDT opens at 9am Nov 1 PST.
    expect(shiftSalesTime('2026-10-04T16:00:00.000Z', OCT, NOV)).toBe('2026-11-01T17:00:00.000Z');
  });

  it('passes a null (no limit) through', () => {
    expect(shiftSalesTime(null, OCT, NOV)).toBeNull();
  });

  it('moves backwards when the copy is earlier', () => {
    expect(shiftSalesTime('2026-11-01T17:00:00.000Z', NOV, OCT)).toBe('2026-10-04T16:00:00.000Z');
  });
});
