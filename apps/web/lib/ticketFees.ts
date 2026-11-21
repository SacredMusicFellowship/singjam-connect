// What to add so the organisation still nets the ticket price after Stripe
// takes its cut.
//
// Confirmed on stripe.com/pricing, 2026-09-08: 2.9% + 30c for domestic US
// cards. There is no nonprofit discount to wait for — that programme needs 80%
// of account volume to be tax-deductible donations, and it names ticket sales
// as a category that does not count.
//
// International cards cost another 1.5% and currency conversion another 1%.
// Everyone is charged the domestic rate and the difference is absorbed, rather
// than quoting two prices for the same ticket.

export const STRIPE_PERCENT = 0.029;
export const STRIPE_FIXED_CENTS = 30;

// Gross up rather than add 2.9% to the price: Stripe's fee is charged on the
// total the buyer pays, including this addition. Adding a flat 2.9% would leave
// the organisation short by the fee on the fee.
export function coverageFeeCents(subtotalCents: number): number {
  if (!Number.isFinite(subtotalCents) || subtotalCents <= 0) return 0;
  const gross = (subtotalCents + STRIPE_FIXED_CENTS) / (1 - STRIPE_PERCENT);
  // Round up: a rounded-down cent is one the organisation pays.
  return Math.ceil(gross) - subtotalCents;
}
