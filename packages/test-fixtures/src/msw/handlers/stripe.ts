import { http, HttpResponse } from "msw";
import { recordCall } from "../calls";

const API = "https://api.stripe.com/v1";
let counter = 0;
const nextId = (prefix: string) => `${prefix}_test_mock_${String(++counter).padStart(6, "0")}`;

// stripe-node sends form-encoded bodies.
const form = (body: string) => new URLSearchParams(body);

// Stripe's standard 2.9% + 30¢.
const fee = (amount: number) => (amount === 0 ? 0 : Math.round(amount * 0.029) + 30);

type Coupon = {
  id: string;
  object: "coupon";
  percent_off: number | null;
  amount_off: number | null;
  currency: string | null;
  valid: boolean;
};

type PromotionCode = {
  id: string;
  object: "promotion_code";
  code: string | null;
  active: boolean;
  coupon: Coupon | null;
  expires_at: number | null;
  max_redemptions: number | null;
  times_redeemed: number;
};

// Coupons and promotion codes the app creates are remembered, so retrieving one later returns the
// discount it was made with, as Stripe does. Stripe nests the coupon under `promotion`.
const coupons = new Map<string, Coupon>();
const promotionCodes = new Map<string, PromotionCode>();
const withPromotion = (promo: PromotionCode) => ({ ...promo, promotion: { type: "coupon", coupon: promo.coupon } });

// Codes the app can't make itself, since its form sets no expiry or redemption limit. A test
// points its own ticket_promo_codes row at one of these ids to try a code Stripe would refuse.
const halfOff = (id: string): Coupon => ({ id, object: "coupon", percent_off: 50, amount_off: null, currency: null, valid: true });
export const FIXTURE_PROMOTION_CODES: Record<"expired" | "fullyRedeemed", PromotionCode> = {
  expired: {
    id: "promo_test_expired",
    object: "promotion_code",
    code: "EXPIRED",
    active: true,
    coupon: halfOff("coupon_test_expired"),
    expires_at: Math.floor(Date.UTC(2024, 0, 1) / 1000),
    max_redemptions: null,
    times_redeemed: 0,
  },
  fullyRedeemed: {
    id: "promo_test_fully_redeemed",
    object: "promotion_code",
    code: "USEDUP",
    active: true,
    coupon: halfOff("coupon_test_fully_redeemed"),
    expires_at: null,
    max_redemptions: 1,
    times_redeemed: 1,
  },
};
const findPromotionCode = (id: string) =>
  promotionCodes.get(id) ?? Object.values(FIXTURE_PROMOTION_CODES).find((p) => p.id === id);

export const stripeHandlers = [
  http.post(`${API}/checkout/sessions`, async ({ request }) => {
    const params = form(await recordCall("stripe", request));
    const id = nextId("cs");
    const metadata: Record<string, string> = {};
    for (const [key, value] of params) {
      const match = key.match(/^metadata\[(.+)\]$/);
      if (match) metadata[match[1]] = value;
    }
    return HttpResponse.json({
      id,
      object: "checkout.session",
      client_secret: `${id}_secret_mock`,
      ui_mode: params.get("ui_mode"),
      status: "open",
      payment_status: "unpaid",
      currency: params.get("currency") ?? "usd",
      customer_email: params.get("customer_email"),
      metadata,
      url: null,
    });
  }),

  http.get(`${API}/checkout/sessions/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    return HttpResponse.json({
      id: params.id,
      object: "checkout.session",
      status: "complete",
      payment_status: "paid",
      amount_total: 1500,
      currency: "usd",
      payment_intent: "pi_test_mock_000001",
      customer_details: { email: "member@singjam.test", name: "Rowan Reedbank" },
      metadata: {},
    });
  }),

  http.get(`${API}/payment_intents/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    const amount = 1500;
    return HttpResponse.json({
      id: params.id,
      object: "payment_intent",
      status: "succeeded",
      amount,
      currency: "usd",
      latest_charge: {
        id: "ch_test_mock_000001",
        object: "charge",
        balance_transaction: { id: "txn_test_mock_000001", object: "balance_transaction", amount, fee: fee(amount), net: amount - fee(amount) },
      },
    });
  }),

  http.post(`${API}/coupons`, async ({ request }) => {
    const params = form(await recordCall("stripe", request));
    const coupon: Coupon = {
      id: nextId("coupon"),
      object: "coupon",
      percent_off: params.get("percent_off") ? Number(params.get("percent_off")) : null,
      amount_off: params.get("amount_off") ? Number(params.get("amount_off")) : null,
      currency: params.get("currency"),
      valid: true,
    };
    coupons.set(coupon.id, coupon);
    return HttpResponse.json({ ...coupon, name: params.get("name") });
  }),
  http.get(`${API}/coupons/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    const id = String(params.id);
    return HttpResponse.json(coupons.get(id) ?? { id, object: "coupon", percent_off: 10, amount_off: null, valid: true });
  }),
  http.delete(`${API}/coupons/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    coupons.delete(String(params.id));
    return HttpResponse.json({ id: params.id, object: "coupon", deleted: true });
  }),

  http.post(`${API}/promotion_codes`, async ({ request }) => {
    const params = form(await recordCall("stripe", request));
    const couponId = params.get("coupon") ?? params.get("promotion[coupon]") ?? "";
    const promo: PromotionCode = {
      id: nextId("promo"),
      object: "promotion_code",
      code: params.get("code"),
      active: true,
      coupon: coupons.get(couponId) ?? { id: couponId, object: "coupon", percent_off: null, amount_off: null, currency: null, valid: true },
      expires_at: params.get("expires_at") ? Number(params.get("expires_at")) : null,
      max_redemptions: params.get("max_redemptions") ? Number(params.get("max_redemptions")) : null,
      times_redeemed: 0,
    };
    promotionCodes.set(promo.id, promo);
    return HttpResponse.json(withPromotion(promo));
  }),
  http.get(`${API}/promotion_codes/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    const promo = findPromotionCode(String(params.id));
    if (promo) return HttpResponse.json(withPromotion(promo));
    return HttpResponse.json({ id: params.id, object: "promotion_code", code: "SINGALONG", active: true, times_redeemed: 0 });
  }),
  http.post(`${API}/promotion_codes/:id`, async ({ request, params }) => {
    const body = form(await recordCall("stripe", request));
    const promo = promotionCodes.get(String(params.id));
    if (!promo) return HttpResponse.json({ id: params.id, object: "promotion_code", active: body.get("active") !== "false" });
    if (body.has("active")) promo.active = body.get("active") !== "false";
    return HttpResponse.json(withPromotion(promo));
  }),
];
