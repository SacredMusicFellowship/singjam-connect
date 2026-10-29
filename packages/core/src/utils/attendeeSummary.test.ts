import { describe, it, expect } from 'vitest';
import { attendeeSummaryParts } from './attendeeSummary';

describe('attendeeSummaryParts', () => {
  it('names two people and counts the rest', () => {
    expect(attendeeSummaryParts(['Ben', 'Jake', 'Sherri'], 16)).toEqual({ named: 'Ben, Jake', others: '14 others' });
  });

  it('says "other" for exactly one more', () => {
    expect(attendeeSummaryParts(['Ben', 'Jake', 'Sherri'], 3)).toEqual({ named: 'Ben, Jake', others: '1 other' });
  });

  it('joins two people with "and" when that is everyone', () => {
    expect(attendeeSummaryParts(['Ben', 'Jake'], 2)).toEqual({ named: 'Ben and Jake', others: null });
  });

  it('names one person alone', () => {
    expect(attendeeSummaryParts(['Ben'], 1)).toEqual({ named: 'Ben', others: null });
  });

  it('counts extra seats beyond the people named', () => {
    expect(attendeeSummaryParts(['Ben'], 3)).toEqual({ named: 'Ben', others: '2 others' });
  });
});
