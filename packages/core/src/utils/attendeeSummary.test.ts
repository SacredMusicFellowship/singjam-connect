import { describe, it, expect } from 'vitest';
import { attendeeSummaryLine } from './attendeeSummary';

describe('attendeeSummaryLine', () => {
  it('names two people and counts the rest', () => {
    expect(attendeeSummaryLine(['Ben', 'Jake', 'Sherri'], 16)).toBe('Ben, Jake and 14 others');
  });

  it('says "other" for exactly one more', () => {
    expect(attendeeSummaryLine(['Ben', 'Jake', 'Sherri'], 3)).toBe('Ben, Jake and 1 other');
  });

  it('joins two people with "and" when that is everyone', () => {
    expect(attendeeSummaryLine(['Ben', 'Jake'], 2)).toBe('Ben and Jake');
  });

  it('names one person alone', () => {
    expect(attendeeSummaryLine(['Ben'], 1)).toBe('Ben');
  });

  it('counts extra seats beyond the people named', () => {
    expect(attendeeSummaryLine(['Ben'], 3)).toBe('Ben and 2 others');
  });
});
