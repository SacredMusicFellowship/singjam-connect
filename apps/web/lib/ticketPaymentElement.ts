// The ticket checkout's Payment Element settings, shared by the real form and
// the `next dev` preview so the two can't drift.
//
// Country is hidden (decided Oct 27): every event is in the Bay Area, so the
// card's billing country is sent as US at confirm instead. ZIP stays, because
// many US cards decline without it. The trade-off: a non-US card is still
// submitted with country US, which can fail its postal-code check.
export const BILLING_COUNTRY = "US";

export const TICKET_PAYMENT_ELEMENT_OPTIONS = {
  layout: "tabs",
  wallets: { link: "never" },
  fields: { billingDetails: { address: { country: "never", postalCode: "auto" } } },
} as const;
