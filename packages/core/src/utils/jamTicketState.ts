/**
 * Ticket state for an official event as shown in a *listing* (home page,
 * /jams, the native jams tab) — not the detail page, where the purchase panel
 * shows the real tiers.
 *
 * An event sells either through an external link or through our own tiers,
 * never both, so tickets_url wins outright when it is set.
 */

/** One row of the jam_ticket_tiers(uuid[]) RPC (migration 164). */
export type JamTicketTier = {
  jam_id: string;
  ticket_type_id: string;
  price_cents: number;
  currency: string | null;
  /** null = uncapped. */
  remaining: number | null;
  not_yet_open: boolean;
  closed: boolean;
  sales_start_at: string | null;
};

/** A jam's tiers folded into the facts a listing card needs. */
export type JamTicketSummary = {
  jam_id: string;
  tier_count: number;
  on_sale_count: number;
  /** Cheapest tier a buyer can take right now; null when nothing is on sale. */
  min_price_cents: number | null;
  currency: string | null;
  sold_out: boolean;
  next_sales_start_at: string | null;
};

function onSale(tier: JamTicketTier): boolean {
  return !tier.not_yet_open && !tier.closed && (tier.remaining === null || tier.remaining > 0);
}

/**
 * Folds the RPC's per-tier rows into one summary per jam. Lives here rather
 * than in SQL so web and native share one implementation of the rollup rules
 * and they stay under test.
 */
export function summarizeTicketTiers(
  rows: JamTicketTier[] | null | undefined
): Map<string, JamTicketSummary> {
  // "Sold out" is only about tiers still inside their sales window: a closed
  // tier ran out of time rather than stock, so counting those would report a
  // sellout nobody caused. Hence the open/empty tally alongside the summary.
  const acc = new Map<string, { summary: JamTicketSummary; openTiers: number; emptyTiers: number }>();

  for (const tier of rows ?? []) {
    let entry = acc.get(tier.jam_id);
    if (!entry) {
      entry = {
        summary: {
          jam_id: tier.jam_id,
          tier_count: 0,
          on_sale_count: 0,
          min_price_cents: null,
          currency: null,
          sold_out: false,
          next_sales_start_at: null,
        },
        openTiers: 0,
        emptyTiers: 0,
      };
      acc.set(tier.jam_id, entry);
    }
    const { summary } = entry;

    summary.tier_count += 1;

    if (onSale(tier)) {
      summary.on_sale_count += 1;
      if (summary.min_price_cents === null || tier.price_cents < summary.min_price_cents) {
        summary.min_price_cents = tier.price_cents;
        summary.currency = tier.currency;
      }
    }

    if (!tier.closed) {
      entry.openTiers += 1;
      // An uncapped tier (null) can never run out.
      if (tier.remaining === 0) entry.emptyTiers += 1;
    }

    if (tier.not_yet_open && tier.sales_start_at) {
      const earliest = summary.next_sales_start_at;
      if (!earliest || tier.sales_start_at < earliest) {
        summary.next_sales_start_at = tier.sales_start_at;
      }
    }
  }

  const byJam = new Map<string, JamTicketSummary>();
  for (const [jamId, { summary, openTiers, emptyTiers }] of acc) {
    summary.sold_out = openTiers > 0 && emptyTiers === openTiers;
    byJam.set(jamId, summary);
  }
  return byJam;
}

export type JamTicketState = {
  label: string;
  /** Set only for events selling off-site; the caller opens it externally. */
  url: string | null;
  /**
   * How to render it. A price is information, so it reads as plain bold text —
   * the pattern Eventbrite uses, and the reason this is not a filled pill: a
   * solid primary-colour chip looks like a button and the card is the button.
   * The other kinds are status, which get soft-tinted pills the way Luma's
   * "Waitlist" / "Near Capacity" and this app's own RsvpBadge already do.
   */
  kind: "price" | "external" | "pending" | "unavailable";
};

function money(cents: number, currency: string | null): string {
  const code = (currency ?? "usd").toUpperCase();
  const amount = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  return code === "USD" ? `$${amount}` : `${amount} ${code}`;
}

export function jamTicketState(
  ticketsUrl: string | null | undefined,
  summary: JamTicketSummary | null | undefined,
  opts: { timezone?: string | null; now?: Date } = {}
): JamTicketState | null {
  if (ticketsUrl) return { label: "Tickets", url: ticketsUrl, kind: "external" };
  if (!summary || summary.tier_count === 0) return null;

  if (summary.sold_out) return { label: "Sold out", url: null, kind: "unavailable" };

  if (summary.on_sale_count > 0) {
    const cents = summary.min_price_cents ?? 0;
    if (cents === 0) return { label: "Free", url: null, kind: "price" };
    const price = money(cents, summary.currency);
    return {
      label: summary.tier_count > 1 ? `From ${price}` : price,
      url: null,
      kind: "price",
    };
  }

  if (summary.next_sales_start_at) {
    const opensAt = new Date(summary.next_sales_start_at);
    const now = opts.now ?? new Date();
    // Beyond a week out a weekday is ambiguous ("Fri" — this one or next?), so
    // switch to a date once it stops reading as "soon".
    const soon = opensAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;
    const when = opensAt.toLocaleDateString("en-US", {
      timeZone: opts.timezone ?? undefined,
      ...(soon ? { weekday: "short" } : { month: "short", day: "numeric" }),
    });
    return { label: `Tickets open ${when}`, url: null, kind: "pending" };
  }

  return { label: "Sales closed", url: null, kind: "unavailable" };
}

/**
 * The call-to-action line(s) an official event's listing card shows.
 *
 * Listing cards say what you can do, not what it costs — price and tiers live
 * on the detail page where you actually buy. The one ticket fact worth
 * surfacing in a list is that there is nothing left to buy, because sending
 * someone to a checkout that will refuse them is worse than saying nothing.
 *
 * `ticketsUrl` is the only case that needs a second link: the card already
 * goes to the detail page, so a separate call to action is only earned when
 * tickets live somewhere else entirely. Callers append the arrows — `→` for
 * the detail page, `↗` for the outbound one.
 */
export function jamTicketCta(
  ticketsUrl: string | null | undefined,
  summary: JamTicketSummary | null | undefined,
  opts: { timezone?: string | null; now?: Date } = {}
): { label: string; hasTickets: boolean; externalUrl: string | null } {
  const state = jamTicketState(ticketsUrl, summary, opts);
  if (!state) return { label: "View details", hasTickets: false, externalUrl: null };
  if (state.kind === "external") {
    return { label: "View details", hasTickets: true, externalUrl: state.url };
  }
  if (state.kind === "unavailable") {
    return { label: `${state.label} — view details`, hasTickets: false, externalUrl: null };
  }
  return { label: "Details and tickets", hasTickets: true, externalUrl: null };
}
