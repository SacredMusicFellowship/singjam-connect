import { describe, it, expect } from "vitest";
import { coverageFeeCents, STRIPE_PERCENT, STRIPE_FIXED_CENTS } from "./ticketFees";

// What Stripe actually deducts from a given gross, for checking the round trip.
const stripeTakes = (grossCents: number) =>
  Math.round(grossCents * STRIPE_PERCENT) + STRIPE_FIXED_CENTS;

describe("coverageFeeCents", () => {
  it("covers the fee on a $15 ticket", () => {
    // (1500 + 30) / 0.971 = 1575.7 -> 1576, so 76c on top.
    expect(coverageFeeCents(1500)).toBe(76);
  });

  it("leaves the organisation whole, which a flat 2.9% would not", () => {
    for (const subtotal of [500, 1500, 3000, 4000, 12345]) {
      const gross = subtotal + coverageFeeCents(subtotal);
      expect(gross - stripeTakes(gross)).toBeGreaterThanOrEqual(subtotal);
    }
  });

  it("charges more than a naive percentage, because the fee is charged on the fee", () => {
    const naive = Math.round(1500 * STRIPE_PERCENT) + STRIPE_FIXED_CENTS;
    expect(coverageFeeCents(1500)).toBeGreaterThan(naive - 1);
    // And the naive figure genuinely leaves them short.
    const grossNaive = 1500 + naive;
    expect(grossNaive - stripeTakes(grossNaive)).toBeLessThan(1500);
  });

  it("is zero for a free or fully discounted order", () => {
    expect(coverageFeeCents(0)).toBe(0);
    expect(coverageFeeCents(-100)).toBe(0);
  });

  it("handles a nonsense subtotal without producing NaN", () => {
    expect(coverageFeeCents(NaN)).toBe(0);
    expect(coverageFeeCents(Infinity)).toBe(0);
  });

  it("grows with the order", () => {
    expect(coverageFeeCents(3000)).toBeGreaterThan(coverageFeeCents(1500));
  });
});
