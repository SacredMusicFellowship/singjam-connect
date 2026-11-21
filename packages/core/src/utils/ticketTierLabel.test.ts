import { describe, it, expect } from 'vitest';
import { ticketTierAvailability, type TicketTierAvailability } from './ticketTierLabel';

const LA = 'America/Los_Angeles';

const tier = (over: Partial<TicketTierAvailability> = {}): TicketTierAvailability => ({
  on_sale: true,
  not_yet_open: false,
  closed: false,
  remaining: null,
  sales_start_at: null,
  sales_end_at: null,
  ...over,
});

describe('ticketTierAvailability', () => {
  it('says nothing for an open-ended tier with stock — the price says it all', () => {
    expect(ticketTierAvailability(tier(), LA)).toBeNull();
    expect(ticketTierAvailability(tier({ remaining: 250 }), LA)).toBeNull();
  });

  it('dates an inclusive end in the VENUE timezone, not UTC', () => {
    // The real Advance window: 11:59:59pm PT on Oct 3, stored as Oct 4 in UTC.
    // Formatted in UTC this reads "Oct 4" and advertises the deadline a day
    // late — the bug this function exists to prevent.
    const advance = tier({ sales_end_at: '2026-10-04T06:59:59.000Z' });
    expect(ticketTierAvailability(advance, LA)).toBe('Through Oct 3');
    expect(ticketTierAvailability(advance, 'UTC')).toBe('Through Oct 4');
  });

  it('dates a tier that has not opened yet', () => {
    const dayOf = tier({
      on_sale: false,
      not_yet_open: true,
      sales_start_at: '2026-10-04T07:00:00.000Z',
    });
    expect(ticketTierAvailability(dayOf, LA)).toBe('Available Oct 4');
  });

  it('falls back when a not-yet-open tier has no start date', () => {
    expect(
      ticketTierAvailability(tier({ on_sale: false, not_yet_open: true }), LA)
    ).toBe('Not on sale yet');
  });

  it('reports a closed tier and a sold-out tier distinctly', () => {
    expect(ticketTierAvailability(tier({ on_sale: false, closed: true }), LA)).toBe('Sales closed');
    expect(ticketTierAvailability(tier({ on_sale: false, remaining: 0 }), LA)).toBe('Sold out');
  });

  it('prefers "sold out" over a stale window when stock ran out first', () => {
    const gone = tier({ on_sale: false, remaining: 0, sales_end_at: '2026-10-04T06:59:59.000Z' });
    expect(ticketTierAvailability(gone, LA)).toBe('Sold out');
  });

  it('shows low stock, and both facts when a tier is scarce and closing', () => {
    expect(ticketTierAvailability(tier({ remaining: 4 }), LA)).toBe('4 left');
    expect(
      ticketTierAvailability(tier({ remaining: 4, sales_end_at: '2026-10-04T06:59:59.000Z' }), LA)
    ).toBe('Through Oct 3 · 4 left');
  });

  it('stays quiet about comfortable stock', () => {
    expect(ticketTierAvailability(tier({ remaining: 11 }), LA)).toBeNull();
    expect(ticketTierAvailability(tier({ remaining: 10 }), LA)).toBe('10 left');
  });

  it('falls back to the runtime zone when the jam has none recorded', () => {
    expect(ticketTierAvailability(tier({ sales_end_at: '2026-10-04T06:59:59.000Z' }), null))
      .toMatch(/^Through /);
  });
});
