import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRetrieve } = vi.hoisted(() => ({ mockRetrieve: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ paymentIntents: { retrieve: mockRetrieve } }) }));

import { resolveStripeFees } from "./stripeFees";

function adminMock() {
  const eq = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn(() => ({ eq }));
  return { admin: { from: vi.fn(() => ({ update })) } as any, update, eq };
}

const pi = (fee: number | null) => ({
  latest_charge: { balance_transaction: fee === null ? null : { fee } },
});

beforeEach(() => {
  mockRetrieve.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolveStripeFees", () => {
  it("uses cached fees without calling Stripe", async () => {
    const { admin } = adminMock();
    const out = await resolveStripeFees(admin, [
      { id: "o1", stripe_payment_intent_id: "pi_1", stripe_fee_cents: 117 },
      { id: "o2", stripe_payment_intent_id: "pi_2", stripe_fee_cents: 75 },
    ]);
    expect(out).toEqual({ feeCents: 192, pending: 0 });
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("looks up a missing fee from the balance transaction and caches it", async () => {
    const { admin, update, eq } = adminMock();
    mockRetrieve.mockResolvedValue(pi(117));
    const out = await resolveStripeFees(admin, [
      { id: "o1", stripe_payment_intent_id: "pi_1", stripe_fee_cents: null },
    ]);
    expect(mockRetrieve).toHaveBeenCalledWith("pi_1", { expand: ["latest_charge.balance_transaction"] });
    expect(update).toHaveBeenCalledWith({ stripe_fee_cents: 117 });
    expect(eq).toHaveBeenCalledWith("id", "o1");
    expect(out).toEqual({ feeCents: 117, pending: 0 });
  });

  it("treats a comped order with no payment intent as no fee", async () => {
    const { admin } = adminMock();
    const out = await resolveStripeFees(admin, [
      { id: "o1", stripe_payment_intent_id: null, stripe_fee_cents: null },
    ]);
    expect(out).toEqual({ feeCents: 0, pending: 0 });
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("counts an unsettled balance transaction as pending and caches nothing", async () => {
    const { admin, update } = adminMock();
    mockRetrieve.mockResolvedValue(pi(null));
    const out = await resolveStripeFees(admin, [
      { id: "o1", stripe_payment_intent_id: "pi_1", stripe_fee_cents: null },
    ]);
    expect(out).toEqual({ feeCents: 0, pending: 1 });
    expect(update).not.toHaveBeenCalled();
  });

  it("caches a zero fee for a payment the live account never made", async () => {
    const { admin, update } = adminMock();
    mockRetrieve.mockRejectedValue(Object.assign(new Error("No such payment_intent"), { code: "resource_missing" }));
    const out = await resolveStripeFees(admin, [
      { id: "o1", stripe_payment_intent_id: "pi_test", stripe_fee_cents: null },
    ]);
    expect(out).toEqual({ feeCents: 0, pending: 0 });
    expect(update).toHaveBeenCalledWith({ stripe_fee_cents: 0 });
  });

  it("counts a failed lookup as pending instead of failing the page", async () => {
    const { admin } = adminMock();
    mockRetrieve.mockRejectedValueOnce(new Error("rate limited")).mockResolvedValueOnce(pi(75));
    const out = await resolveStripeFees(admin, [
      { id: "o1", stripe_payment_intent_id: "pi_1", stripe_fee_cents: null },
      { id: "o2", stripe_payment_intent_id: "pi_2", stripe_fee_cents: null },
    ]);
    expect(out).toEqual({ feeCents: 75, pending: 1 });
  });
});
