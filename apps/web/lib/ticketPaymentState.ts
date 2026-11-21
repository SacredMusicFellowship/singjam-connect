/**
 * What the dedicated payment page should do with an order.
 *
 * Card entry lives on its own route rather than swapping in place inside the
 * event page's ticket column, which means the page can be *reloaded* — and a
 * reload has to be safe. The old in-place step kept the client secret in React
 * state, so a refresh lost the form; the buyer would re-select and press Buy
 * again, and because the checkout route reserves unconditionally that minted a
 * second order holding a second lot of stock for the full hold window.
 *
 * So the page never mints anything. It reads the order it was given, retrieves
 * that order's existing Stripe session, and this decides what to render. Pure
 * and separate from the page so the state machine is testable without a
 * Stripe account or a browser.
 */

/** The order columns this needs. */
export type PaymentOrder = {
  status: string;
  amount_cents: number;
  currency: string;
  stripe_checkout_session_id: string | null;
  /** When the inventory hold lapses. */
  expires_at: string;
};

/** One row of the order summary. */
export type PaymentLine = { label: string; quantity: number; amountCents: number };

/** The shape of a Stripe line item, as much of it as the summary needs. */
export type SessionLineItem = {
  description?: string | null;
  quantity?: number | null;
  amount_total?: number | null;
};

/** The Checkout Session fields this needs, or null when it could not be read. */
export type PaymentSession = {
  status: string | null;
  client_secret: string | null;
  /** What Stripe will actually charge, in the smallest currency unit. */
  amount_total: number | null;
  /** Requires expand: ['line_items'] on retrieve. */
  line_items?: SessionLineItem[] | null;
  /** Session-level discount, which is where a promotion code lands. */
  discount_cents?: number | null;
} | null;

/**
 * The order summary, read off the session rather than rebuilt from our own
 * tables, so it cannot disagree with the amount being charged. Stripe holds the
 * promotion-code discount and the processing-fee line, neither of which is
 * recoverable from ticket_orders alone.
 *
 * Line names are created as "<event> — <tier>", which is right in a Stripe
 * receipt but repeats the event name down every row here. The prefix is only
 * removed when it matches the event name exactly — no guessing at a separator.
 *
 * That match is also how a ticket line is told apart from the processing fee,
 * which our checkout route never prefixes. Tier names alone read as adjectives
 * once the event name is gone — a row saying "Advance" above one saying
 * "Processing fee" is missing its noun — so ticket rows get one. Singular
 * always: the row renders its own "× 2" where the quantity is more than one,
 * and "Advance ticket × 2" is the receipt idiom, naming the unit and counting
 * it rather than pluralising both. A host who already put "ticket" in the tier
 * name keeps their wording instead of getting "Advance ticket ticket".
 */
export function summarisePaymentLines(
  items: SessionLineItem[] | null | undefined,
  eventName?: string | null
): PaymentLine[] {
  const prefix = eventName ? `${eventName} — ` : null;
  return (items ?? []).map((item) => {
    const raw = (item.description ?? "").trim();
    const isTicketLine = !!prefix && raw.startsWith(prefix);
    const tier = isTicketLine ? raw.slice(prefix!.length) : raw;
    const needsNoun = isTicketLine && !!tier && !/\btickets?\b/i.test(tier);
    return {
      label: needsNoun ? `${tier} ticket` : tier || "Ticket",
      quantity: item.quantity ?? 1,
      amountCents: item.amount_total ?? 0,
    };
  });
}

export type TicketPaymentState =
  /** Mount the Payment Element with this secret. */
  | {
      kind: "pay";
      clientSecret: string;
      amountCents: number;
      currency: string;
      lines: PaymentLine[];
      discountCents: number;
    }
  /** Already paid, or Stripe says the session completed — show the receipt. */
  | { kind: "done" }
  /** The hold or the session lapsed; the buyer has to start again. */
  | { kind: "expired" };

export function resolveTicketPaymentState(
  order: PaymentOrder,
  session: PaymentSession,
  now: Date = new Date(),
  eventName?: string | null
): TicketPaymentState {
  // A paid order is finished whatever Stripe currently says about the session.
  if (order.status === "paid" || order.status === "refunded") return { kind: "done" };
  if (order.status !== "pending") return { kind: "expired" };

  // The hold is what reserves the stock, so once it lapses the tickets may
  // already have been resold — never take a payment against it. Checked before
  // the session because the DB is the authority on inventory, not Stripe.
  if (new Date(order.expires_at).getTime() <= now.getTime()) return { kind: "expired" };

  // Pending with no session means the session create failed after the reserve
  // (the route marks those 'failed', so this is belt and braces). A fully
  // discounted order never reaches this page — it is paid server-side and
  // redirected straight to the receipt.
  if (!order.stripe_checkout_session_id || !session) return { kind: "expired" };

  // 'complete' can arrive before the webhook has flipped the order, which is
  // why the receipt page frames a pending order as "confirming" rather than
  // failed. Send them there rather than showing a card form for a paid session.
  if (session.status === "complete") return { kind: "done" };
  if (session.status !== "open" || !session.client_secret) return { kind: "expired" };

  return {
    kind: "pay",
    clientSecret: session.client_secret,
    // The session's total, not the order's. ticket_orders.amount_cents is the
    // ticket subtotal; the "cover the processing fee" amount is a separate line
    // item on the session, so the order row says 1500 where the buyer is about
    // to be charged 1576. Stripe's own Pay button reads the session, so using
    // the order here put two different prices on one screen.
    amountCents: session.amount_total ?? order.amount_cents,
    currency: order.currency,
    lines: summarisePaymentLines(session.line_items, eventName),
    discountCents: session.discount_cents ?? 0,
  };
}
