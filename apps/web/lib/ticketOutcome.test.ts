import { describe, it, expect } from "vitest";
import { resolveTicketOutcome } from "./ticketOutcome";

const pending = { status: "pending", stripe_checkout_session_id: "cs_test_abc" };

describe("resolveTicketOutcome", () => {
  it("shows a paid order as paid", () => {
    expect(resolveTicketOutcome({ status: "paid", stripe_checkout_session_id: "cs_1" }, null)).toEqual({
      kind: "paid",
      awaitingFulfilment: false,
    });
  });

  it("shows a pending order as paid the moment Stripe says the card went through", () => {
    // The whole point: at redirect time the card is already charged. Waiting
    // for our own webhook left the buyer on "Confirming your payment…" with
    // no ticket on screen.
    expect(resolveTicketOutcome(pending, { payment_status: "paid" })).toEqual({
      kind: "paid",
      awaitingFulfilment: true,
    });
  });

  it("does NOT trust a completed session whose money is still in flight", () => {
    // A bank debit or some BNPL completes the session before the payment
    // clears. session.status would be "complete" here; payment_status is the
    // only field that distinguishes it, which is why it is the one tested.
    expect(resolveTicketOutcome(pending, { payment_status: "unpaid" }).kind).toBe("pending");
    expect(resolveTicketOutcome(pending, { payment_status: null }).kind).toBe("pending");
    expect(resolveTicketOutcome(pending, {}).kind).toBe("pending");
  });

  it("stays pending when the session could not be read at all", () => {
    // Stripe unreachable, or a key in the wrong mode. Never claim a payment
    // succeeded on the strength of a failed lookup.
    expect(resolveTicketOutcome(pending, null).kind).toBe("pending");
  });

  it("reports a refund as a refund whatever the session says", () => {
    const refunded = { status: "refunded", stripe_checkout_session_id: "cs_1" };
    expect(resolveTicketOutcome(refunded, { payment_status: "paid" }).kind).toBe("refunded");
  });

  it("reports an expired or failed order as not charged", () => {
    for (const status of ["expired", "failed"]) {
      const o = { status, stripe_checkout_session_id: "cs_1" };
      expect(resolveTicketOutcome(o, { payment_status: "paid" }).kind).toBe("failed");
    }
  });

  it("reports a missing order as missing", () => {
    expect(resolveTicketOutcome(null, null)).toEqual({ kind: "missing", awaitingFulfilment: false });
  });

  it("only flags awaitingFulfilment on the Stripe-confirmed path", () => {
    // A fully fulfilled order must not keep the poller alive.
    expect(
      resolveTicketOutcome({ status: "paid", stripe_checkout_session_id: "cs_1" }, { payment_status: "paid" })
        .awaitingFulfilment
    ).toBe(false);
  });
});
