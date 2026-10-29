"use client";

import { PaymentElement } from "@stripe/react-stripe-js";
import { TICKET_PAYMENT_ELEMENT_OPTIONS } from "@/lib/ticketPaymentElement";

// TicketCheckoutForm's stand-in under `next dev`, where there is no Checkout
// Session to confirm. Same Payment Element options and the same button, but Pay
// moves on to the confirmation preview instead of calling Stripe.
export default function TicketPreviewForm({ totalLabel, completeUrl }: { totalLabel: string; completeUrl: string }) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        window.location.href = completeUrl;
      }}
      className="space-y-3"
    >
      <PaymentElement options={TICKET_PAYMENT_ELEMENT_OPTIONS} />

      <button
        type="submit"
        className="w-full rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        Pay {totalLabel}
      </button>
    </form>
  );
}
