import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolvePromoCode } from "@/lib/promoCode";
import { coverageFeeCents } from "@/lib/ticketFees";
import { fulfilPendingOrder } from "@/lib/ticketFulfilment";
import { ticketingBlocked } from "@/lib/devSafety";
import { buildCheckoutPreview, previewUrl } from "@/lib/ticketCheckoutPreview";
import {
  stripe,
  SITE_URL,
  TICKET_INTEGRATION_ID,
  HOLD_MINUTES,
  SESSION_EXPIRY_MINUTES,
  EXCLUDED_PAYMENT_METHODS,
  TICKET_PM_CONFIG,
} from "@/lib/stripe";

type Item = { ticket_type_id: string; quantity: number };

// Deliberately permissive. Stripe validates the address properly when the
// session is completed; this only catches obvious typos before we reserve stock.
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

// Frees reserved stock straight away instead of making the buyer wait out the
// hold window for tickets they never got a chance to pay for.
async function releaseHold(admin: ReturnType<typeof supabaseAdmin>, orderId: string) {
  await admin
    .from("ticket_orders")
    .update({ status: "failed", updated_at: new Date().toISOString() })
    .eq("id", orderId);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jamId } = await params;

  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    // Native app authenticates with a bearer token instead of cookies
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }

  let items: Item[];
  let guestEmail = "";
  let guestName = "";
  let promoCode = "";
  let coverFees = false;
  let marketingOptIn = false;
  try {
    const body = await req.json();
    items = Array.isArray(body?.items) ? body.items : [];
    guestEmail = typeof body?.email === "string" ? body.email.trim() : "";
    guestName = typeof body?.name === "string" ? body.name.trim() : "";
    promoCode = typeof body?.promo_code === "string" ? body.promo_code.trim() : "";
    // Both default to false here, not true. The checkbox defaults to ticked in
    // the UI, but a request that says nothing must not be read as consent.
    coverFees = body?.cover_fees === true;
    marketingOptIn = body?.marketing_opt_in === true;
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "No tickets selected" }, { status: 400 });
  }

  // Buying a ticket does not require an account — most people arrive from a
  // shared link and won't sign up to buy. Guests are identified by email, which
  // is also where their ticket goes, so it is the one thing we must insist on.
  const buyerEmail = user?.email ?? guestEmail;
  if (!user && !isEmail(guestEmail)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: jam } = await admin
    .from("jams")
    .select("id, name, visibility")
    .eq("id", jamId)
    .single();
  if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });

  // Paid ticketing is the official-event path. Community and private jams keep
  // the free RSVP flow in ../rsvp/route.ts.
  if (jam.visibility !== "official") {
    return NextResponse.json({ error: "This event does not sell tickets" }, { status: 400 });
  }

  // `next dev` stops here, before the reservation, and walks the rest of the flow
  // as a preview built from the selection: the payment page for a charged order,
  // straight to the confirmation for a free one, as the real flow does.
  if (ticketingBlocked(`ticket checkout for jam ${jamId}`)) {
    const preview = await buildCheckoutPreview(admin, jamId, jam.name ?? null, items, promoCode, coverFees);
    if ("error" in preview) return NextResponse.json({ error: preview.error }, { status: 400 });
    const step = preview.amountCents === 0 ? "complete" : "pay";
    return NextResponse.json({ preview_url: previewUrl(jamId, step, items, promoCode, coverFees) });
  }

  // Reserve stock first. Doing this before creating the Stripe session is what
  // stops us collecting money for a sold-out tier — the reverse order would
  // hand the buyer a payable session against stock that may already be gone.
  const { data: orderId, error: reserveError } = await admin.rpc("reserve_ticket_order", {
    jam_id_param: jamId,
    buyer_param: user?.id ?? null,
    items,
    hold_minutes: HOLD_MINUTES,
    buyer_email_param: buyerEmail || null,
    buyer_name_param: guestName || null,
  });

  if (reserveError || !orderId) {
    // The RPC raises human-readable messages ("only 1 left of General").
    return NextResponse.json(
      { error: reserveError?.message ?? "Could not reserve tickets" },
      { status: 409 }
    );
  }

  // Only guests are asked, so a signed-in buyer can never be recorded as having
  // opted in here — their subscription came from creating an account.
  if (marketingOptIn && !user) {
    await admin.from("ticket_orders").update({ marketing_opt_in: true }).eq("id", orderId);
  }

  const { data: order } = await admin
    .from("ticket_orders")
    .select("id, amount_cents, currency")
    .eq("id", orderId)
    .single();

  const { data: lines } = await admin
    .from("tickets")
    .select("ticket_type_id, ticket_types(name, price_cents, currency)")
    .eq("order_id", orderId);

  // Collapse the per-ticket rows back into one Stripe line item per tier.
  const byType = new Map<string, { name: string; price_cents: number; currency: string; qty: number }>();
  for (const row of lines ?? []) {
    const t = (row as any).ticket_types;
    const key = (row as any).ticket_type_id;
    const existing = byType.get(key);
    if (existing) existing.qty += 1;
    else byType.set(key, { name: t.name, price_cents: t.price_cents, currency: t.currency, qty: 1 });
  }

  // Promotion codes live in Stripe, not in our schema — Stripe applies the
  // discount and its amount_total is authoritative. ui_mode 'elements' has no
  // built-in code field, so the code is resolved here and attached to the
  // session; allow_promotion_codes only applies to Stripe-rendered checkout.
  let discounts: { promotion_code: string }[] | undefined;
  let promoCodeId: string | null = null;
  let totalCents = order!.amount_cents;
  if (promoCode) {
    // Shared with the preview so the two can't disagree — and because the free
    // path below never reaches Stripe, this is the only thing enforcing expiry
    // and redemption limits on a fully-discounted order.
    const resolved = await resolvePromoCode(admin, jamId, promoCode, order!.amount_cents, order!.currency);

    if ("error" in resolved) {
      await releaseHold(admin, order!.id);
      return NextResponse.json({ error: "Could not check that code" }, { status: 502 });
    }
    if (!resolved.valid) {
      await releaseHold(admin, order!.id);
      return NextResponse.json({ error: resolved.reason }, { status: 400 });
    }
    discounts = [{ promotion_code: resolved.promotionCodeId }];
    promoCodeId = resolved.promoCodeId;
    totalCents = resolved.totalCents;
  }

  // Computed after any discount, so a buyer covering fees on a discounted
  // ticket covers the fee on what they actually pay. A percentage promotion
  // code does also discount this line in Stripe, so the organisation recovers
  // slightly less than the whole fee on that combination — cents, and only when
  // both are in play.
  const feeCents = coverFees ? coverageFeeCents(totalCents) : 0;

  // Nothing to charge, so don't ask. Stripe would happily make a zero-amount
  // session, but the Payment Element still renders a card form against it and
  // the buyer is left entering details for a $0.00 "payment". A comped ticket
  // isn't a payment, so it skips the processor entirely and is fulfilled here,
  // through the same code the webhook uses for a charged order.
  if (totalCents === 0) {
    if (promoCodeId) await recordPromoCode(admin, order!.id, promoCodeId);
    const paid = await fulfilPendingOrder(admin, order!.id, { amountCents: 0 });
    if (!paid) {
      await releaseHold(admin, order!.id);
      return NextResponse.json({ error: "Could not complete that order" }, { status: 409 });
    }
    return NextResponse.json({
      order_id: order!.id,
      free: true,
      client_secret: null,
      amount_cents: 0,
      currency: order!.currency,
    });
  }

  try {
    const sessionParams = {
      // 'elements' backs the embedded Payment Element with a Checkout Session
      // rather than a raw PaymentIntent, which is what keeps automatic_tax,
      // discounts and adaptive pricing available as configuration later. The
      // enum is elements | embedded_page | hosted_page — there is no 'custom'
      // value, despite older prose calling this flow "custom checkout" (the
      // name survives only in the Stripe.js namespace, js/custom_checkout/*).
      ui_mode: "elements",
      mode: "payment",
      // payment_method_types is deliberately omitted — that enables dynamic
      // payment methods, managed from the Dashboard with no code change.
      // Hardcoding ['card'] would suppress wallets and hurt conversion.
      // Narrowing happens through exclusion instead, which keeps the rest dynamic.
      // Prefer a purpose-built configuration when one is set; the exclusions are
      // the fallback for when it isn't, and are harmless alongside it.
      ...(TICKET_PM_CONFIG ? { payment_method_configuration: TICKET_PM_CONFIG } : {}),
      excluded_payment_method_types: [...EXCLUDED_PAYMENT_METHODS],
      ...(discounts ? { discounts } : {}),
      integration_identifier: TICKET_INTEGRATION_ID,
      client_reference_id: order!.id,
      metadata: { order_id: order!.id, jam_id: jamId, buyer_user_id: user?.id ?? "" },
      // A valid email is required to complete a Checkout Session. Members are
      // already signed in and guests supplied one above, so it is always known —
      // which is what lets the form be payment fields only, with no contact step.
      ...(buyerEmail ? { customer_email: buyerEmail } : {}),
      // Required for ui_mode 'elements' once any redirect-based payment method
      // is enabled — and dynamic payment methods mean we cannot assume none is.
      return_url: `${SITE_URL}/jam/${jamId}/tickets/complete?session_id={CHECKOUT_SESSION_ID}`,
      // 30 minutes is Stripe's floor for expires_at, and is deliberately shorter
      // than the database hold so the session always dies first. See lib/stripe.ts.
      expires_at: Math.floor(Date.now() / 1000) + SESSION_EXPIRY_MINUTES * 60,
      line_items: [
        ...[...byType.values()].map((l) => ({
          quantity: l.qty,
          price_data: {
            currency: l.currency,
            unit_amount: l.price_cents,
            product_data: { name: `${jam.name ?? "Event"} — ${l.name}` },
          },
        })),
        // Its own line so the buyer sees what the ticket costs and what the
        // processing costs, rather than one inflated ticket price.
        ...(feeCents > 0
          ? [
              {
                quantity: 1,
                price_data: {
                  currency: order!.currency,
                  unit_amount: feeCents,
                  product_data: { name: "Processing fee" },
                },
              },
            ]
          : []),
      ],
    };

    // A payment method configuration belongs to one Stripe mode. Point a test
    // deployment at the live id (or the reverse) and EVERY sale dies with
    // resource_missing — verified. Losing the narrowed method list is a much
    // smaller problem than losing checkout, so a bad id degrades to the default
    // configuration and says so loudly instead.
    let session;
    try {
      session = await stripe().checkout.sessions.create(sessionParams as any);
    } catch (e: any) {
      const badConfig =
        TICKET_PM_CONFIG &&
        e?.code === "resource_missing" &&
        String(e?.message ?? "").includes("payment_method_configuration");
      if (!badConfig) throw e;
      console.error(
        `[tickets] STRIPE_TICKET_PM_CONFIG ${TICKET_PM_CONFIG} does not exist in this Stripe mode — ` +
          "falling back to the default payment method configuration. Fix the env var."
      );
      // A fresh object, not a mutation: Stripe's client keeps the params it was
      // handed, so editing them in place rewrites the record of the first call.
      const { payment_method_configuration: _dropped, ...withoutConfig } = sessionParams as any;
      session = await stripe().checkout.sessions.create(withoutConfig);
    }

    await admin
      .from("ticket_orders")
      .update({ stripe_checkout_session_id: session.id, updated_at: new Date().toISOString() })
      .eq("id", order!.id);
    if (promoCodeId) await recordPromoCode(admin, order!.id, promoCodeId);

    return NextResponse.json({
      order_id: order!.id,
      client_secret: session.client_secret,
      amount_cents: order!.amount_cents,
      currency: order!.currency,
    });
  } catch (e: any) {
    // Release the hold immediately rather than making the buyer wait out the
    // expiry window for stock they never got a chance to pay for.
    await admin
      .from("ticket_orders")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", order!.id);
    return NextResponse.json({ error: "Could not start checkout" }, { status: 502 });
  }
}

// Which code the order used, so the ticket manager can count uses Stripe never
// sees (a code that makes the order free). Its own write, and never fatal: the
// count is bookkeeping, and checkout must not fail over it — including before
// migration 166 adds the column.
async function recordPromoCode(admin: ReturnType<typeof supabaseAdmin>, orderId: string, promoCodeId: string) {
  try {
    const { error } = await admin.from("ticket_orders").update({ promo_code_id: promoCodeId }).eq("id", orderId);
    if (error) console.error("[tickets] could not record the promo code on the order", error);
  } catch (e) {
    console.error("[tickets] could not record the promo code on the order", e);
  }
}
