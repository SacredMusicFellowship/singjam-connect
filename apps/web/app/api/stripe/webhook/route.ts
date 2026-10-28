import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { fulfilPendingOrder } from "@/lib/ticketFulfilment";
import { ticketingBlocked } from "@/lib/devSafety";

// Fulfilment happens here, never in the browser's return_url handler — the
// buyer can close the tab before it runs, and a client callback can be forged.
// Stripe may redeliver any event, so every branch must be idempotent.

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  // Must be the raw body — parsing it first would break signature verification.
  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // A `stripe listen` forward reaching next dev must not fulfil, expire or
  // refund production orders. 200 so the CLI doesn't keep redelivering.
  if (ticketingBlocked(`Stripe webhook ${event.type}`)) {
    return NextResponse.json({ received: true, blocked: true });
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const session = event.data.object as Stripe.Checkout.Session;

      // Delayed methods can report completed while still unpaid.
      if (session.payment_status === "unpaid") break;

      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (!orderId) break;

      // Idempotent: only a pending order transitions, so redelivery is a no-op
      // and a later refund event cannot be undone by a replayed success.
      // Everything after "this order is real" is shared with the free-ticket
      // path in the checkout route, so a comped ticket and a bought one end up
      // in exactly the same state. Idempotent, which is what makes redelivery
      // safe. Reconciles amount_cents to what Stripe actually charged: ours was
      // computed from tier prices before any promotion code.
      await fulfilPendingOrder(admin, orderId, {
        amountCents: typeof session.amount_total === "number" ? session.amount_total : null,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
      });
      break;
    }

    case "checkout.session.expired":
    case "checkout.session.async_payment_failed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.order_id ?? session.client_reference_id;
      if (!orderId) break;

      await admin
        .from("ticket_orders")
        .update({
          status: event.type === "checkout.session.expired" ? "expired" : "failed",
          updated_at: now,
        })
        .eq("id", orderId)
        .eq("status", "pending");
      break;
    }

    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      const intentId = typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (!intentId) break;

      // Only a full refund voids the order; a partial refund leaves the tickets
      // valid and is reconciled in the Dashboard.
      if (charge.amount_refunded < charge.amount) break;

      const { data: order } = await admin
        .from("ticket_orders")
        .update({ status: "refunded", updated_at: now })
        .eq("stripe_payment_intent_id", intentId)
        .eq("status", "paid")
        .select("id, jam_id, buyer_user_id")
        .maybeSingle();

      // Guest orders never created an attendance row, so there is none to cancel.
      if (order?.buyer_user_id) {
        await admin
          .from("jam_rsvps")
          .update({ status: "cancelled", waitlist_position: null })
          .eq("jam_id", order.jam_id)
          .eq("user_id", order.buyer_user_id);
      }
      break;
    }

    case "charge.dispute.created": {
      // Recorded but not acted on — voiding a ticket automatically on a dispute
      // would let a chargeback cancel someone's entry before it is resolved.
      break;
    }
  }

  return NextResponse.json({ received: true });
}
