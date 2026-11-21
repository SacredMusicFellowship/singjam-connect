import { NextResponse } from "next/server";
import { promoCodeForCopy, shiftSalesTime } from "@singjam/core";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManageJam } from "@/lib/jamAuthz";
import { stripe } from "@/lib/stripe";
import { createPromoCode } from "@/lib/ticketPromoCodes";

// Copies an official event's ticket tiers and promo codes onto a copy of it.
// Sales windows move with the event date; promo codes get the new event's date
// as their suffix, because codes are unique across all events. Sales, holds and
// redemptions are never copied — they belong to the original.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;

  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const fromId = typeof body?.from === "string" ? body.from : "";
  if (!fromId || fromId === jamId) return NextResponse.json({ error: "Source event required" }, { status: 400 });

  const admin = supabaseAdmin();
  const [{ data: target }, { data: source }] = await Promise.all([
    admin.from("jams").select("starts_at, timezone, visibility").eq("id", jamId).maybeSingle(),
    admin.from("jams").select("starts_at, timezone, visibility, ticket_limit").eq("id", fromId).maybeSingle(),
  ]);
  if (!target || !source) return NextResponse.json({ error: "Jam not found" }, { status: 404 });
  if (target.visibility !== "official" || source.visibility !== "official") {
    return NextResponse.json({ error: "Tickets only exist on official events" }, { status: 400 });
  }

  const [canTarget, canSource] = await Promise.all([
    canManageJam(admin, jamId, user.id),
    canManageJam(admin, fromId, user.id),
  ]);
  if (!canTarget || !canSource) {
    return NextResponse.json({ error: "Only the host can manage tickets" }, { status: 403 });
  }

  // Refuse a second copy onto the same event rather than doubling its tiers.
  const { data: existing } = await admin.from("ticket_types").select("id").eq("jam_id", jamId).limit(1);
  if ((existing ?? []).length > 0) {
    return NextResponse.json({ error: "This event already has ticket tiers" }, { status: 409 });
  }

  const from = { startsAt: source.starts_at, timeZone: source.timezone ?? "UTC" };
  const to = { startsAt: target.starts_at, timeZone: target.timezone ?? "UTC" };

  const { data: tiers } = await admin
    .from("ticket_types")
    .select("name, description, price_cents, currency, quantity, sales_start_at, sales_end_at, sort_order")
    .eq("jam_id", fromId)
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true });

  if ((tiers ?? []).length > 0) {
    const { error } = await admin.from("ticket_types").insert(
      tiers!.map((t) => ({
        ...t,
        jam_id: jamId,
        sales_start_at: shiftSalesTime(t.sales_start_at, from, to),
        sales_end_at: shiftSalesTime(t.sales_end_at, from, to),
      }))
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (source.ticket_limit) {
    const { error } = await admin.from("jams").update({ ticket_limit: source.ticket_limit }).eq("id", jamId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { data: promos } = await admin
    .from("ticket_promo_codes")
    .select("code, stripe_coupon_id")
    .eq("jam_id", fromId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  // One code failing (a name clash, a coupon deleted in the Dashboard) shouldn't
  // lose the rest, so each is reported rather than aborting the copy.
  const created: string[] = [];
  const skipped: { code: string; reason: string }[] = [];
  for (const p of promos ?? []) {
    const code = promoCodeForCopy(p.code, from, to);
    if (code.length > 40) {
      skipped.push({ code, reason: "Code would be longer than 40 characters" });
      continue;
    }

    let discount: { percentOff: number } | { amountOffCents: number };
    try {
      const coupon = await stripe().coupons.retrieve(p.stripe_coupon_id);
      if (coupon.percent_off != null) discount = { percentOff: coupon.percent_off };
      else if (coupon.amount_off != null) discount = { amountOffCents: coupon.amount_off };
      else throw new Error("no discount");
    } catch {
      skipped.push({ code, reason: `Couldn't read ${p.code}'s discount from Stripe` });
      continue;
    }

    const result = await createPromoCode(admin, { jamId, code, discount, userId: user.id });
    if (result.ok) created.push(result.row.code);
    else skipped.push({ code, reason: result.error });
  }

  return NextResponse.json({ tiers: (tiers ?? []).length, promo_codes: created, skipped });
}
