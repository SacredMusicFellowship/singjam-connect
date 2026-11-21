import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

// Resolving a promotion code against an order: is it valid for THIS jam, is it
// still live, and what does it take off?
//
// Both the preview and the charge go through here. That mattered once the free
// path existed: checkout used to attach the code to a Checkout Session and let
// Stripe enforce expiry and redemption limits, but a 100%-off order never
// reaches Stripe, so those limits would go unchecked unless we apply them
// ourselves. One resolver means the preview can never promise a discount the
// charge won't honour, either.

export type PromoResolution =
  | { valid: false; reason: string }
  | { valid: false; error: true }
  | {
      valid: true;
      code: string;
      label: string;
      // Our ticket_promo_codes row, recorded on the order.
      promoCodeId: string;
      promotionCodeId: string;
      discountCents: number;
      totalCents: number;
    };

export async function resolvePromoCode(
  admin: SupabaseClient,
  jamId: string,
  code: string,
  subtotalCents: number,
  currency: string,
): Promise<PromoResolution> {
  // Resolved through OUR table, scoped to this jam. Looking the code up in
  // Stripe by name would honour any active code on the account, so a discount
  // created for one event would work on every other event's checkout.
  const { data: registered } = await admin
    .from("ticket_promo_codes")
    .select("id, stripe_promotion_code_id")
    .eq("jam_id", jamId)
    .ilike("code", code)
    .maybeSingle();

  if (!registered) return { valid: false, reason: "That code isn't valid for this event" };

  let promo: any;
  try {
    promo = await stripe().promotionCodes.retrieve(registered.stripe_promotion_code_id, {
      expand: ["promotion.coupon"],
    });
  } catch {
    return { valid: false, error: true };
  }

  if (promo?.active === false) return { valid: false, reason: "That code is no longer active" };

  const coupon = promo.promotion?.coupon;
  if (!coupon || coupon.valid === false) return { valid: false, reason: "That code has expired" };

  if (promo.expires_at && promo.expires_at * 1000 < Date.now()) {
    return { valid: false, reason: "That code has expired" };
  }
  if (promo.max_redemptions != null && promo.times_redeemed >= promo.max_redemptions) {
    return { valid: false, reason: "That code has been fully redeemed" };
  }

  const min = promo.restrictions?.minimum_amount;
  if (min != null && subtotalCents < min) {
    const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() });
    return { valid: false, reason: `That code needs a minimum order of ${fmt.format(min / 100)}` };
  }

  // Coupons scoped to specific Stripe Products can never match our line items,
  // which are built from inline price_data rather than a Stripe catalogue. Say
  // so here instead of letting the discount silently fail at charge time.
  if (coupon.applies_to?.products?.length) {
    return { valid: false, reason: "That code doesn't apply to tickets" };
  }

  let discountCents = 0;
  if (typeof coupon.percent_off === "number") {
    discountCents = Math.round((subtotalCents * coupon.percent_off) / 100);
  } else if (typeof coupon.amount_off === "number") {
    // A fixed-amount coupon in another currency can't be applied to this order.
    if (coupon.currency && coupon.currency.toLowerCase() !== currency.toLowerCase()) {
      return { valid: false, reason: "That code can't be used on this order" };
    }
    discountCents = Math.min(coupon.amount_off, subtotalCents);
  } else {
    return { valid: false, reason: "That code isn't valid" };
  }

  const label =
    typeof coupon.percent_off === "number"
      ? `${coupon.percent_off}% off`
      : `${new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(
          (coupon.amount_off ?? 0) / 100
        )} off`;

  return {
    valid: true,
    code: promo.code,
    label,
    promoCodeId: registered.id,
    promotionCodeId: registered.stripe_promotion_code_id,
    discountCents,
    totalCents: Math.max(0, subtotalCents - discountCents),
  };
}
