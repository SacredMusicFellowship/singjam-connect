"use client";

import { useState } from "react";
import { PaymentElement, useCheckoutElements } from "@stripe/react-stripe-js/checkout";
import { BILLING_COUNTRY, TICKET_PAYMENT_ELEMENT_OPTIONS } from "@/lib/ticketPaymentElement";

export default function TicketCheckoutForm() {
  const checkoutState = useCheckoutElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Do NOT call checkout.updateEmail() here. The session is created with
  // customer_email set server-side, and updateEmail then throws "You cannot
  // update the email because a customer_email or customer with an email is
  // already set on the Checkout Session" — which, thrown during render, stops
  // the Payment Element mounting at all.

  if (checkoutState.type === "loading") {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-4 w-28 animate-pulse rounded bg-zinc-200" />
        <div className="h-11 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-11 animate-pulse rounded-xl bg-zinc-200" />
        <div className="h-11 w-full animate-pulse rounded-xl bg-zinc-200" />
      </div>
    );
  }

  if (checkoutState.type === "error") {
    return (
      <p className="text-sm text-red-600">{checkoutState.error.message}</p>
    );
  }

  const { checkout } = checkoutState;
  const total = checkout.total?.total?.amount;

  async function pay(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    // The Payment Element doesn't ask for country, so Stripe needs it here.
    const result = await checkout.confirm({ billingAddress: { address: { country: BILLING_COUNTRY } } });
    // On success the browser is redirected to return_url, so reaching here with
    // a result generally means it failed. Fulfilment is never done from this
    // callback — the webhook is the source of truth.
    if (result?.type === "error") setError(result.error.message ?? "Payment failed");
    setBusy(false);
  }

  return (
    <form onSubmit={pay} className="space-y-3">
      {/* Link is off: its "save my info" step adds email and phone fields to a
          form that should ask only for the card. Wallets stay on. Tabs rather
          than an accordion: the card form is open straight away, and the other
          methods sit in one row above it instead of stacking between the card
          fields and the Pay button. */}
      <PaymentElement options={TICKET_PAYMENT_ELEMENT_OPTIONS} />

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="submit"
        // Deliberately NOT gated on checkout.canConfirm. That value is a
        // snapshot taken when this component rendered, and completing the card
        // inside Stripe's iframe does not re-render us — so it stays false
        // forever and the button is permanently disabled, with no way for
        // anyone to pay. Verified in a browser: card complete, canConfirm still
        // false. confirm() validates and returns a readable error instead.
        disabled={busy}
        className="w-full rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {busy ? "Processing…" : total ? `Pay ${total}` : "Pay"}
      </button>
    </form>
  );
}
