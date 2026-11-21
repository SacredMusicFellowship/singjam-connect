import { describe, it, expect } from "vitest";
import {
  resolveTicketPaymentState,
  summarisePaymentLines,
  type PaymentOrder,
} from "./ticketPaymentState";

const NOW = new Date("2026-09-09T21:00:00Z");
const LATER = "2026-09-09T21:30:00Z"; // hold still live
const PAST = "2026-09-09T20:55:00Z"; // hold lapsed

const order = (over: Partial<PaymentOrder> = {}): PaymentOrder => ({
  status: "pending",
  amount_cents: 1576,
  currency: "usd",
  stripe_checkout_session_id: "cs_test_abc",
  expires_at: LATER,
  ...over,
});

const openSession = { status: "open", client_secret: "cs_test_abc_secret_xyz", amount_total: 1576 };

describe("resolveTicketPaymentState", () => {
  it("pays when the order is held and the session is open", () => {
    expect(resolveTicketPaymentState(order(), openSession, NOW)).toEqual({
      kind: "pay",
      clientSecret: "cs_test_abc_secret_xyz",
      amountCents: 1576,
      currency: "usd",
      lines: [],
      discountCents: 0,
    });
  });

  it("charges the session's total, not the order's subtotal", () => {
    // The order row holds the ticket price; the cover-the-fee amount is a
    // separate line item on the session. Showing the order's number put $15.00
    // in the header while Stripe's own Pay button said $15.76.
    const state = resolveTicketPaymentState(order({ amount_cents: 1500 }), openSession, NOW);
    expect(state).toMatchObject({ kind: "pay", amountCents: 1576 });
  });

  it("falls back to the order subtotal if the session has no total", () => {
    const state = resolveTicketPaymentState(
      order({ amount_cents: 1500 }),
      { ...openSession, amount_total: null },
      NOW
    );
    expect(state).toMatchObject({ kind: "pay", amountCents: 1500 });
  });

  it("is safe to reload — the same inputs resolve the same way every time", () => {
    const o = order();
    const first = resolveTicketPaymentState(o, openSession, NOW);
    const second = resolveTicketPaymentState(o, openSession, NOW);
    expect(second).toEqual(first);
  });

  it("sends a paid order to the receipt, whatever the session says", () => {
    expect(resolveTicketPaymentState(order({ status: "paid" }), null, NOW).kind).toBe("done");
    expect(
      resolveTicketPaymentState(order({ status: "paid" }), { status: "open", client_secret: "x", amount_total: 1576 }, NOW).kind
    ).toBe("done");
    expect(resolveTicketPaymentState(order({ status: "refunded" }), null, NOW).kind).toBe("done");
  });

  it("treats a completed session as done even before the webhook lands", () => {
    // The order is still 'pending' here; the receipt page calls that
    // "confirming". Showing a card form instead would invite a second payment.
    const state = resolveTicketPaymentState(order(), { status: "complete", client_secret: null, amount_total: 1576 }, NOW);
    expect(state.kind).toBe("done");
  });

  it("refuses to take payment once the inventory hold has lapsed", () => {
    // The stock may already have been resold, so an open Stripe session is not
    // enough — the database is the authority on inventory.
    const state = resolveTicketPaymentState(order({ expires_at: PAST }), openSession, NOW);
    expect(state.kind).toBe("expired");
  });

  it("treats the exact expiry instant as lapsed", () => {
    const state = resolveTicketPaymentState(
      order({ expires_at: NOW.toISOString() }),
      openSession,
      NOW
    );
    expect(state.kind).toBe("expired");
  });

  it("expires a failed or already-expired order", () => {
    for (const status of ["failed", "expired"]) {
      expect(resolveTicketPaymentState(order({ status }), openSession, NOW).kind).toBe("expired");
    }
  });

  it("expires when the session cannot be read or was never created", () => {
    expect(resolveTicketPaymentState(order(), null, NOW).kind).toBe("expired");
    expect(
      resolveTicketPaymentState(order({ stripe_checkout_session_id: null }), null, NOW).kind
    ).toBe("expired");
  });

  it("expires an expired session, and an open one with no secret", () => {
    expect(
      resolveTicketPaymentState(order(), { status: "expired", client_secret: null, amount_total: null }, NOW).kind
    ).toBe("expired");
    expect(
      resolveTicketPaymentState(order(), { status: "open", client_secret: null, amount_total: 1576 }, NOW).kind
    ).toBe("expired");
  });
});

describe("summarisePaymentLines", () => {
  const EVENT = "SingJam at the Starry Plough";

  it("strips the event-name prefix Stripe line names carry", () => {
    expect(
      summarisePaymentLines(
        [{ description: `${EVENT} — Advance`, quantity: 2, amount_total: 3000 }],
        EVENT
      )
    ).toEqual([{ label: "Advance ticket", quantity: 2, amountCents: 3000 }]);
  });

  it("gives a bare tier name its noun, and keeps the unit singular", () => {
    // "Advance" sitting above "Processing fee" reads as an adjective with
    // nothing to modify. The row renders its own "× 3" for the count, so the
    // noun names the unit rather than doubling the plural.
    const one = summarisePaymentLines(
      [{ description: `${EVENT} — Advance`, quantity: 1, amount_total: 1500 }],
      EVENT
    );
    expect(one[0].label).toBe("Advance ticket");

    const three = summarisePaymentLines(
      [{ description: `${EVENT} — Day-Of`, quantity: 3, amount_total: 6000 }],
      EVENT
    );
    expect(three[0]).toMatchObject({ label: "Day-Of ticket", quantity: 3 });
  });

  it("leaves the wording alone when the tier name already says ticket", () => {
    for (const name of ["Advance Ticket", "advance tickets", "Ticket — early"]) {
      const lines = summarisePaymentLines(
        [{ description: `${EVENT} — ${name}`, quantity: 2, amount_total: 3000 }],
        EVENT
      );
      expect(lines[0].label).toBe(name);
    }
  });

  it("never adds a noun to the processing fee", () => {
    const lines = summarisePaymentLines(
      [
        { description: `${EVENT} — Advance`, quantity: 1, amount_total: 1500 },
        { description: "Processing fee", quantity: 1, amount_total: 76 },
      ],
      EVENT
    );
    expect(lines.map((l) => l.label)).toEqual(["Advance ticket", "Processing fee"]);
  });

  it("leaves a line that does not carry the prefix alone", () => {
    // The processing fee is its own line and was never prefixed.
    expect(
      summarisePaymentLines([{ description: "Processing fee", quantity: 1, amount_total: 76 }], EVENT)
    ).toEqual([{ label: "Processing fee", quantity: 1, amountCents: 76 }]);
  });

  it("only strips an exact match, never a partial one", () => {
    const lines = summarisePaymentLines(
      [{ description: "SingJam at the Oakland Grove — Advance", quantity: 1, amount_total: 1500 }],
      EVENT
    );
    expect(lines[0].label).toBe("SingJam at the Oakland Grove — Advance");
  });

  it("keeps the full name when the event name is unknown", () => {
    const lines = summarisePaymentLines(
      [{ description: `${EVENT} — Advance`, quantity: 1, amount_total: 1500 }],
      null
    );
    expect(lines[0].label).toBe(`${EVENT} — Advance`);
  });

  it("fills in for a missing description, quantity or amount", () => {
    expect(summarisePaymentLines([{}], EVENT)).toEqual([
      { label: "Ticket", quantity: 1, amountCents: 0 },
    ]);
  });

  it("returns nothing when line items were not expanded", () => {
    expect(summarisePaymentLines(null, EVENT)).toEqual([]);
    expect(summarisePaymentLines(undefined, EVENT)).toEqual([]);
  });

  it("keeps several tiers in the order Stripe returned them", () => {
    const lines = summarisePaymentLines(
      [
        { description: `${EVENT} — Advance`, quantity: 2, amount_total: 3000 },
        { description: `${EVENT} — Supporter`, quantity: 1, amount_total: 3600 },
        { description: "Processing fee", quantity: 1, amount_total: 222 },
      ],
      EVENT
    );
    expect(lines.map((l) => l.label)).toEqual([
      "Advance ticket",
      "Supporter ticket",
      "Processing fee",
    ]);
    expect(lines.reduce((sum, l) => sum + l.amountCents, 0)).toBe(6822);
  });
});
