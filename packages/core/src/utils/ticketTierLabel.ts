/**
 * The availability line under a tier's price on the event page.
 *
 * A display rule rather than a component detail, because both apps show tiers
 * (native's purchase panel is still to come) and because the date arithmetic
 * has a trap worth a test: an inclusive end stored as 2026-10-04T06:59:59Z is
 * 11:59:59pm on Oct **3** at the venue. Formatted in the runtime's zone — UTC
 * on the server — it reads Oct 4, advertising a deadline a day late.
 */

export type TicketTierAvailability = {
  on_sale: boolean;
  not_yet_open: boolean;
  closed: boolean;
  /** null = uncapped. */
  remaining: number | null;
  sales_start_at: string | null;
  sales_end_at: string | null;
};

/** Below this, remaining stock is worth saying out loud. */
const LOW_STOCK = 10;

function day(iso: string, timezone?: string | null): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: timezone ?? undefined,
    month: "short",
    day: "numeric",
  });
}

/**
 * Returns the text to append after the price, or null when the price says it
 * all. The caller adds the separator.
 */
export function ticketTierAvailability(
  tier: TicketTierAvailability,
  timezone?: string | null
): string | null {
  if (tier.not_yet_open) {
    return tier.sales_start_at
      ? `Available ${day(tier.sales_start_at, timezone)}`
      : "Not on sale yet";
  }
  if (tier.closed) return "Sales closed";
  if (tier.remaining === 0) return "Sold out";

  // On sale. The deadline is the whole point of an advance price, so it leads;
  // low stock is the other fact worth knowing and they can both be true.
  // Capitalised to match "Available", "Sales closed" and "Sold out" — every
  // note in this set opens with a capital.
  const parts: string[] = [];
  if (tier.sales_end_at) parts.push(`Through ${day(tier.sales_end_at, timezone)}`);
  if (tier.remaining !== null && tier.remaining <= LOW_STOCK) {
    parts.push(`${tier.remaining} left`);
  }
  return parts.length ? parts.join(" · ") : null;
}
