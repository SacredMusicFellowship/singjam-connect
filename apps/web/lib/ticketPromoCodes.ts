import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

type Discount = { percentOff: number } | { amountOffCents: number };

type Result =
  | { ok: true; row: { id: string; code: string; label: string } }
  | { ok: false; status: number; error: string };

// Creates a Stripe coupon plus promotion code and records the jam association
// locally — Stripe codes are account-wide, so the association is what stops a
// code being redeemable on somebody else's event. Callers validate the code
// format and discount first.
export async function createPromoCode(
  admin: SupabaseClient,
  { jamId, code, discount, userId }: { jamId: string; code: string; discount: Discount; userId: string }
): Promise<Result> {
  // Check our own uniqueness first so a duplicate is a clear message rather than
  // a Stripe error, and so we don't leave an orphaned coupon behind on failure.
  const { data: clash } = await admin
    .from("ticket_promo_codes")
    .select("id, jam_id")
    .ilike("code", code)
    .maybeSingle();
  if (clash) {
    return {
      ok: false,
      status: 409,
      error: clash.jam_id === jamId ? "That code already exists for this event" : "That code is already used by another event",
    };
  }

  // The tier currency, so a fixed-amount coupon matches what tickets are priced in.
  const { data: tier } = await admin
    .from("ticket_types")
    .select("currency")
    .eq("jam_id", jamId)
    .limit(1)
    .maybeSingle();
  const currency = tier?.currency ?? "usd";

  let couponId: string | null = null;
  try {
    const coupon = await stripe().coupons.create(
      "percentOff" in discount
        ? { percent_off: discount.percentOff, duration: "once", name: `${code} (${jamId.slice(0, 8)})` }
        : { amount_off: discount.amountOffCents, currency, duration: "once", name: `${code} (${jamId.slice(0, 8)})` }
    );
    couponId = coupon.id;

    const promo = await stripe().promotionCodes.create({
      promotion: { type: "coupon", coupon: coupon.id }, // a bare `coupon` param is rejected
      code,
    });

    const label =
      "percentOff" in discount
        ? `${discount.percentOff}% off`
        : `${new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency.toUpperCase(),
          }).format(discount.amountOffCents / 100)} off`;

    const { data: row, error } = await admin
      .from("ticket_promo_codes")
      .insert({
        jam_id: jamId,
        code,
        stripe_promotion_code_id: promo.id,
        stripe_coupon_id: coupon.id,
        label,
        created_by: userId,
      })
      .select("id, code, label")
      .single();

    if (error) {
      // Our row is what scopes the code to this event. Without it the Stripe code
      // would exist and be redeemable nowhere — so retire it rather than leaving
      // an unusable code occupying the name.
      await stripe().promotionCodes.update(promo.id, { active: false }).catch(() => {});
      await stripe().coupons.del(coupon.id).catch(() => {});
      return { ok: false, status: 400, error: error.message };
    }

    return { ok: true, row };
  } catch (e: any) {
    if (couponId) await stripe().coupons.del(couponId).catch(() => {});
    // Stripe rejects a duplicate active code even if our table missed it — for
    // instance one created by hand in the Dashboard.
    const msg = /already exists|already active/i.test(e?.message ?? "")
      ? "That code already exists in Stripe"
      : "Could not create that code";
    return { ok: false, status: 400, error: msg };
  }
}
