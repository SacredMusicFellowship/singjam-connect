import { describe, it, expect } from 'vitest';
import { zonedInputToIso, isoToZonedInput, zoneAbbreviation, isValidTimeZone, pickersToZonedInput, zonedInputToPickerDate } from './zonedDateTime';

const LA = 'America/Los_Angeles';

describe('zonedInputToIso', () => {
  it('reads the wall clock in the given zone, not the runtime zone', () => {
    // Oct 3 2026 is PDT (UTC-7), so 11:59pm local is 06:59 the next day in UTC.
    expect(zonedInputToIso('2026-10-03T23:59', LA)).toBe('2026-10-04T06:59:00.000Z');
    expect(zonedInputToIso('2026-10-04T00:00', LA)).toBe('2026-10-04T07:00:00.000Z');
  });

  it('applies the standard-time offset outside DST', () => {
    // Late November is PST (UTC-8).
    expect(zonedInputToIso('2026-11-20T18:00', LA)).toBe('2026-11-21T02:00:00.000Z');
  });

  it('honours a seconds argument so an end time can be inclusive', () => {
    expect(zonedInputToIso('2026-10-03T23:59', LA, 59)).toBe('2026-10-04T06:59:59.000Z');
  });

  it('resolves a time on the far side of a DST transition', () => {
    // 2026-11-01 02:00 local is after the fall-back, so the correct offset is
    // PST — a single-pass conversion would measure PDT and land an hour off.
    expect(zonedInputToIso('2026-11-01T05:00', LA)).toBe('2026-11-01T13:00:00.000Z');
    // And the spring-forward side, where the offset moves the other way.
    expect(zonedInputToIso('2026-03-08T05:00', LA)).toBe('2026-03-08T12:00:00.000Z');
  });

  it('handles a zone ahead of UTC', () => {
    expect(zonedInputToIso('2026-10-04T09:00', 'Europe/Berlin')).toBe('2026-10-04T07:00:00.000Z');
  });

  it('returns null for blank or malformed input so a cleared field nulls the column', () => {
    expect(zonedInputToIso('', LA)).toBeNull();
    expect(zonedInputToIso(null, LA)).toBeNull();
    expect(zonedInputToIso(undefined, LA)).toBeNull();
    expect(zonedInputToIso('not a date', LA)).toBeNull();
    expect(zonedInputToIso('2026-10-03', LA)).toBeNull();
  });

  it('accepts a value that already carries seconds', () => {
    expect(zonedInputToIso('2026-10-03T23:59:30', LA)).toBe('2026-10-04T06:59:00.000Z');
  });
});

describe('isoToZonedInput', () => {
  it('formats an instant as a datetime-local value in the given zone', () => {
    expect(isoToZonedInput('2026-10-04T06:59:59.000Z', LA)).toBe('2026-10-03T23:59');
    expect(isoToZonedInput('2026-10-04T07:00:00.000Z', LA)).toBe('2026-10-04T00:00');
  });

  it('renders midnight as 00:00 rather than 24:00', () => {
    expect(isoToZonedInput('2026-10-04T07:00:00.000Z', LA).endsWith('T00:00')).toBe(true);
  });

  it('round-trips through zonedInputToIso', () => {
    for (const value of ['2026-10-03T23:59', '2026-01-15T08:30', '2026-07-04T12:00']) {
      expect(isoToZonedInput(zonedInputToIso(value, LA), LA)).toBe(value);
    }
  });

  it('round-trips an inclusive end time, dropping the seconds it restores', () => {
    const iso = zonedInputToIso('2026-10-03T23:59', LA, 59);
    expect(isoToZonedInput(iso, LA)).toBe('2026-10-03T23:59');
  });

  it('returns an empty string for a missing or unparseable instant', () => {
    expect(isoToZonedInput(null, LA)).toBe('');
    expect(isoToZonedInput('', LA)).toBe('');
    expect(isoToZonedInput('nonsense', LA)).toBe('');
  });
});

describe('zoneAbbreviation', () => {
  it('names the zone as of the given instant, so DST is reflected', () => {
    expect(zoneAbbreviation(LA, new Date('2026-10-04T07:00:00Z'))).toBe('PDT');
    expect(zoneAbbreviation(LA, new Date('2026-12-04T07:00:00Z'))).toBe('PST');
  });
});

describe('isValidTimeZone', () => {
  it('accepts IANA zones and rejects anything else', () => {
    expect(isValidTimeZone(LA)).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(null)).toBe(false);
  });
});

describe('picker round-trip', () => {
  it('shows and saves the venue wall clock through device-local picker Dates', () => {
    const picker = zonedInputToPickerDate(isoToZonedInput('2026-10-04T21:30:00+00:00', LA))!;
    expect(picker.getHours()).toBe(14);
    expect(picker.getMinutes()).toBe(30);
    expect(zonedInputToIso(pickersToZonedInput(picker, picker), LA)).toBe('2026-10-04T21:30:00.000Z');
  });

  it('takes the day from the date picker and the clock from the time picker', () => {
    expect(pickersToZonedInput(new Date(2026, 9, 4, 9, 0), new Date(2020, 0, 1, 18, 5))).toBe('2026-10-04T18:05');
  });

  it('returns null for a malformed value', () => {
    expect(zonedInputToPickerDate('')).toBeNull();
  });
});
