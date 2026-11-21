/**
 * What to tell a buyer on the confirmation page.
 *
 * The page is reached by Stripe's return_url the instant a payment is
 * confirmed, but fulfilment is the webhook's job and lands a second or two
 * later. Keying the page off our own order status therefore showed "Confirming
 * your payment…" to someone who had just handed over their card details, with
 * no way out but to refresh by hand. Observed live: the page rendered 37
 * seconds before the webhook arrived, and then sat there.
 *
 * The fix is that nobody needs to wait for our webhook to learn whether the
 * card went through — Stripe already knows at redirect time. So a pending order
 * whose session Stripe reports as `paid` is shown as paid. The webhook remains
 * the only thing that fulfils (issues the email, seats the buyer); this only
 * changes how fast the buyer is told.
 *
 * `payment_status === "paid"` is the exact test, and it is deliberately not
 * `status === "complete"`. A delayed-notification method — a bank debit, some
 * BNPL — completes its session while the money is still in flight, and those
 * are genuinely pending. Keying off session status would tell such a buyer they
 * were in before the payment had actually cleared.
 */

export type OutcomeOrder = {
  status: string;
  stripe_checkout_session_id: string | null;
} | null;

/** The Checkout Session fields this needs, or null when it could not be read. */
export type OutcomeSession = {
  payment_status?: string | null;
} | null;

export type TicketOutcome = {
  kind: "paid" | "pending" | "refunded" | "failed" | "missing";
  /**
   * True when Stripe confirmed the payment but our own fulfilment has not
   * landed yet. The page reads the same as any other paid order — its copy
   * points at the email rather than promising anything already delivered —
   * but the poller stays mounted so the ticket details fill in as they land.
   */
  awaitingFulfilment: boolean;
};

export function resolveTicketOutcome(
  order: OutcomeOrder,
  session: OutcomeSession
): TicketOutcome {
  if (!order) return { kind: "missing", awaitingFulfilment: false };
  if (order.status === "paid") return { kind: "paid", awaitingFulfilment: false };
  if (order.status === "refunded") return { kind: "refunded", awaitingFulfilment: false };

  if (order.status === "pending") {
    if (session?.payment_status === "paid") {
      return { kind: "paid", awaitingFulfilment: true };
    }
    return { kind: "pending", awaitingFulfilment: false };
  }

  // expired or failed: the hold was released and nothing was charged.
  return { kind: "failed", awaitingFulfilment: false };
}
