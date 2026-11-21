import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

export type FeeOrder = {
  id: string;
  stripe_payment_intent_id: string | null;
  stripe_fee_cents: number | null;
};

// Stripe looks are capped per batch so a first load of a big event doesn't
// fire hundreds of requests at once into the API rate limit.
const CONCURRENCY = 8;

async function lookupFee(paymentIntentId: string): Promise<number | null> {
  let pi: Stripe.PaymentIntent;
  try {
    pi = await stripe().paymentIntents.retrieve(paymentIntentId, {
      expand: ["latest_charge.balance_transaction"],
    });
  } catch (e) {
    // A test-mode payment written to the production database while testing
    // checkout locally. The live account never charged it, so its fee is zero —
    // retrying would flag the total as incomplete on every load, forever.
    if ((e as Stripe.errors.StripeError)?.code === "resource_missing") return 0;
    throw e;
  }
  const charge = pi.latest_charge as Stripe.Charge | null;
  const bt = charge?.balance_transaction as Stripe.BalanceTransaction | null | undefined;
  return bt && typeof bt === "object" ? bt.fee : null;
}

// Totals Stripe's fees across orders, filling in and caching any that haven't
// been looked up yet. Returns how many charged orders still have no fee (Stripe
// hasn't settled the balance transaction, or the lookup failed) so the page can
// say the total is incomplete rather than understate it.
export async function resolveStripeFees(
  admin: SupabaseClient,
  orders: FeeOrder[],
): Promise<{ feeCents: number; pending: number }> {
  let feeCents = 0;
  let pending = 0;
  const missing: FeeOrder[] = [];

  for (const o of orders) {
    if (o.stripe_fee_cents !== null) feeCents += o.stripe_fee_cents;
    else if (o.stripe_payment_intent_id) missing.push(o);
  }

  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const results = await Promise.all(
      missing.slice(i, i + CONCURRENCY).map(async (o) => {
        try {
          const fee = await lookupFee(o.stripe_payment_intent_id!);
          if (fee !== null) {
            await admin.from("ticket_orders").update({ stripe_fee_cents: fee }).eq("id", o.id);
          }
          return fee;
        } catch (e) {
          console.error("stripe fee lookup failed", o.id, e);
          return null;
        }
      }),
    );
    for (const fee of results) {
      if (fee === null) pending++;
      else feeCents += fee;
    }
  }

  return { feeCents, pending };
}
