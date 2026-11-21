import { describe, it, expect } from 'vitest';
import {
  jamTicketCta,
  jamTicketState,
  summarizeTicketTiers,
  type JamTicketSummary,
  type JamTicketTier,
} from './jamTicketState';

const NOW = new Date('2026-09-08T12:00:00Z');

function summary(over: Partial<JamTicketSummary> = {}): JamTicketSummary {
  return {
    jam_id: 'j1',
    tier_count: 2,
    on_sale_count: 2,
    min_price_cents: 1500,
    currency: 'usd',
    sold_out: false,
    next_sales_start_at: null,
    ...over,
  };
}

describe('jamTicketState', () => {
  it('prefers an external link over on-site tiers', () => {
    expect(jamTicketState('https://tickets.example.com', summary(), { now: NOW })).toEqual({
      label: 'Tickets',
      url: 'https://tickets.example.com',
      kind: 'external',
    });
  });

  it('shows nothing for an event with no tiers and no link', () => {
    expect(jamTicketState(null, null, { now: NOW })).toBeNull();
    expect(jamTicketState(null, summary({ tier_count: 0, on_sale_count: 0 }), { now: NOW })).toBeNull();
  });

  it('names the cheapest on-sale price', () => {
    expect(jamTicketState(null, summary(), { now: NOW })?.label).toBe('From $15');
  });

  it('drops the "From" when there is only one tier', () => {
    expect(jamTicketState(null, summary({ tier_count: 1, on_sale_count: 1 }), { now: NOW })?.label).toBe('$15');
  });

  it('keeps cents when the price is not whole dollars', () => {
    expect(jamTicketState(null, summary({ min_price_cents: 1250 }), { now: NOW })?.label).toBe('From $12.50');
  });

  it('labels a zero-price tier Free', () => {
    expect(jamTicketState(null, summary({ min_price_cents: 0 }), { now: NOW })?.label).toBe('Free');
  });

  it('reports sold out ahead of price', () => {
    expect(jamTicketState(null, summary({ sold_out: true, on_sale_count: 0 }), { now: NOW })).toEqual({
      label: 'Sold out',
      url: null,
      kind: 'unavailable',
    });
  });

  it('names the weekday when sales open within a week', () => {
    const state = jamTicketState(
      null,
      summary({ on_sale_count: 0, min_price_cents: null, next_sales_start_at: '2026-09-11T17:00:00Z' }),
      { timezone: 'America/Los_Angeles', now: NOW }
    );
    expect(state).toEqual({ label: 'Tickets open Fri', url: null, kind: 'pending' });
  });

  it('names a date when sales open further out', () => {
    const state = jamTicketState(
      null,
      summary({ on_sale_count: 0, min_price_cents: null, next_sales_start_at: '2026-10-02T17:00:00Z' }),
      { timezone: 'America/Los_Angeles', now: NOW }
    );
    expect(state?.label).toBe('Tickets open Oct 2');
  });

  // An evening opening in the Americas is already the next day in UTC, the bug
  // shape that put share previews a day out.
  it('formats the opening in the event timezone, not the runtime one', () => {
    const args = summary({ on_sale_count: 0, min_price_cents: null, next_sales_start_at: '2026-09-12T02:30:00Z' });
    expect(jamTicketState(null, args, { timezone: 'America/Los_Angeles', now: NOW })?.label).toBe('Tickets open Fri');
    expect(jamTicketState(null, args, { timezone: 'UTC', now: NOW })?.label).toBe('Tickets open Sat');
  });

  it('falls back to sales closed when nothing is on sale and nothing reopens', () => {
    const state = jamTicketState(null, summary({ on_sale_count: 0, min_price_cents: null }), { now: NOW });
    expect(state).toEqual({ label: 'Sales closed', url: null, kind: 'unavailable' });
  });
});

function tier(over: Partial<JamTicketTier> = {}): JamTicketTier {
  return {
    jam_id: 'j1',
    ticket_type_id: 't1',
    price_cents: 1500,
    currency: 'usd',
    remaining: null,
    not_yet_open: false,
    closed: false,
    sales_start_at: null,
    ...over,
  };
}

describe('summarizeTicketTiers', () => {
  it('tolerates no rows', () => {
    expect(summarizeTicketTiers(null).size).toBe(0);
    expect(summarizeTicketTiers([]).size).toBe(0);
  });

  it('groups tiers by jam', () => {
    const byJam = summarizeTicketTiers([
      tier({ jam_id: 'a' }),
      tier({ jam_id: 'a', ticket_type_id: 't2' }),
      tier({ jam_id: 'b' }),
    ]);
    expect(byJam.get('a')?.tier_count).toBe(2);
    expect(byJam.get('b')?.tier_count).toBe(1);
  });

  it('takes the cheapest on-sale price and its currency', () => {
    const byJam = summarizeTicketTiers([
      tier({ ticket_type_id: 't1', price_cents: 3600 }),
      tier({ ticket_type_id: 't2', price_cents: 1500 }),
    ]);
    expect(byJam.get('j1')).toMatchObject({ min_price_cents: 1500, currency: 'usd', on_sale_count: 2 });
  });

  // The cheap tier being unavailable is exactly when a listing must not quote
  // its price: "From $15" has to name something a buyer can actually take.
  it('ignores tiers that are not purchasable when pricing', () => {
    const byJam = summarizeTicketTiers([
      tier({ ticket_type_id: 't1', price_cents: 1000, remaining: 0 }),
      tier({ ticket_type_id: 't2', price_cents: 1200, closed: true }),
      tier({ ticket_type_id: 't3', price_cents: 1400, not_yet_open: true, sales_start_at: '2026-10-01T00:00:00Z' }),
      tier({ ticket_type_id: 't4', price_cents: 3600 }),
    ]);
    expect(byJam.get('j1')).toMatchObject({ min_price_cents: 3600, on_sale_count: 1, tier_count: 4 });
  });

  it('is sold out only when every open tier is empty', () => {
    expect(summarizeTicketTiers([tier({ remaining: 0 })]).get('j1')?.sold_out).toBe(true);
    expect(
      summarizeTicketTiers([
        tier({ ticket_type_id: 't1', remaining: 0 }),
        tier({ ticket_type_id: 't2', remaining: 3 }),
      ]).get('j1')?.sold_out
    ).toBe(false);
  });

  it('never calls an uncapped tier sold out', () => {
    expect(summarizeTicketTiers([tier({ remaining: null })]).get('j1')?.sold_out).toBe(false);
  });

  // A closed tier ran out of time, not stock. Counting it would report a
  // sellout no buyer caused.
  it('does not treat closed tiers as sold out', () => {
    const byJam = summarizeTicketTiers([
      tier({ ticket_type_id: 't1', closed: true, remaining: 4 }),
      tier({ ticket_type_id: 't2', closed: true, remaining: 0 }),
    ]);
    expect(byJam.get('j1')).toMatchObject({ sold_out: false, on_sale_count: 0, min_price_cents: null });
  });

  it('excludes closed tiers from the sold-out verdict', () => {
    const byJam = summarizeTicketTiers([
      tier({ ticket_type_id: 't1', closed: true, remaining: 9 }),
      tier({ ticket_type_id: 't2', remaining: 0 }),
    ]);
    expect(byJam.get('j1')?.sold_out).toBe(true);
  });

  it('reports the earliest future opening, and reads as pending not sold out', () => {
    const byJam = summarizeTicketTiers([
      tier({ ticket_type_id: 't1', remaining: 20, not_yet_open: true, sales_start_at: '2026-11-01T00:00:00Z' }),
      tier({ ticket_type_id: 't2', remaining: 10, not_yet_open: true, sales_start_at: '2026-10-01T00:00:00Z' }),
    ]);
    expect(byJam.get('j1')).toMatchObject({
      next_sales_start_at: '2026-10-01T00:00:00Z',
      on_sale_count: 0,
      sold_out: false,
    });
    expect(jamTicketState(null, byJam.get('j1'), { timezone: 'UTC', now: NOW })?.label).toBe('Tickets open Oct 1');
  });

  // The whole point of the fold: what the card ends up saying.
  it('feeds jamTicketState end to end', () => {
    const byJam = summarizeTicketTiers([
      tier({ ticket_type_id: 't1', price_cents: 1500 }),
      tier({ ticket_type_id: 't2', price_cents: 3600 }),
    ]);
    expect(jamTicketState(null, byJam.get('j1'), { now: NOW })?.label).toBe('From $15');
  });
});

// A price is information, not an action: it must never come back as something a
// component would style like a button. Everything else is status.
describe('jamTicketState kinds', () => {
  it('classifies a price as price and the rest as status', () => {
    expect(jamTicketState(null, summary(), { now: NOW })?.kind).toBe('price');
    expect(jamTicketState(null, summary({ min_price_cents: 0 }), { now: NOW })?.kind).toBe('price');
    expect(jamTicketState(null, summary({ sold_out: true }), { now: NOW })?.kind).toBe('unavailable');
    expect(jamTicketState('https://x.test', null, { now: NOW })?.kind).toBe('external');
  });

  it('only the external kind carries a url', () => {
    for (const state of [
      jamTicketState(null, summary(), { now: NOW }),
      jamTicketState(null, summary({ sold_out: true }), { now: NOW }),
      jamTicketState(null, summary({ on_sale_count: 0, min_price_cents: null }), { now: NOW }),
    ]) {
      expect(state?.url).toBeNull();
    }
    expect(jamTicketState('https://x.test', null, { now: NOW })?.url).toBe('https://x.test');
  });
});

describe('jamTicketCta', () => {
  it('offers tickets when there is something to buy', () => {
    expect(jamTicketCta(null, summary(), { now: NOW })).toEqual({
      label: 'Details and tickets',
      hasTickets: true,
      externalUrl: null,
    });
    expect(jamTicketCta(null, summary({ min_price_cents: 0 }), { now: NOW }).label).toBe('Details and tickets');
  });

  it('falls back to plain details when the event has no ticketing', () => {
    expect(jamTicketCta(null, null, { now: NOW })).toEqual({
      label: 'View details',
      hasTickets: false,
      externalUrl: null,
    });
  });

  // Pointing someone at a checkout that will refuse them is worse than silence.
  it('says so when there is nothing left to buy', () => {
    expect(jamTicketCta(null, summary({ sold_out: true, on_sale_count: 0 }), { now: NOW })).toEqual({
      label: 'Sold out — view details',
      hasTickets: false,
      externalUrl: null,
    });
    expect(jamTicketCta(null, summary({ on_sale_count: 0, min_price_cents: null }), { now: NOW }).label)
      .toBe('Sales closed — view details');
  });

  it('still invites a click while sales are only pending', () => {
    const pending = summary({ on_sale_count: 0, min_price_cents: null, next_sales_start_at: '2026-09-11T17:00:00Z' });
    expect(jamTicketCta(null, pending, { timezone: 'UTC', now: NOW }).label).toBe('Details and tickets');
  });
});

// An off-site seller is the one case that earns a second link: the card
// already covers the detail page, so a lone "Details and tickets" would be
// pointing at a page that cannot sell.
describe('jamTicketCta with an external seller', () => {
  it('splits into a detail label plus an outbound url', () => {
    expect(jamTicketCta('https://luma.com/abc', null, { now: NOW })).toEqual({
      label: 'View details',
      hasTickets: true,
      externalUrl: 'https://luma.com/abc',
    });
  });

  it('lets the external link win over on-site tiers', () => {
    expect(jamTicketCta('https://luma.com/abc', summary(), { now: NOW }).externalUrl)
      .toBe('https://luma.com/abc');
  });

  it('gives no outbound url to any on-site state', () => {
    for (const s of [summary(), summary({ sold_out: true }), null]) {
      expect(jamTicketCta(null, s, { now: NOW }).externalUrl).toBeNull();
    }
  });
});
