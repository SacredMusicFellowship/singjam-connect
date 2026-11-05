import { http, HttpResponse } from "msw";
import { recordCall } from "../calls";

const API = "https://api.stripe.com/v1";
let counter = 0;
const nextId = (prefix: string) => `${prefix}_test_mock_${String(++counter).padStart(6, "0")}`;

// stripe-node sends form-encoded bodies.
const form = (body: string) => new URLSearchParams(body);

// Stripe's standard 2.9% + 30¢.
const fee = (amount: number) => (amount === 0 ? 0 : Math.round(amount * 0.029) + 30);

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
    return HttpResponse.json({
      id: nextId("coupon"),
      object: "coupon",
      percent_off: params.get("percent_off") ? Number(params.get("percent_off")) : null,
      amount_off: params.get("amount_off") ? Number(params.get("amount_off")) : null,
      currency: params.get("currency"),
      name: params.get("name"),
      valid: true,
    });
  }),
  http.get(`${API}/coupons/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    return HttpResponse.json({ id: params.id, object: "coupon", percent_off: 10, amount_off: null, valid: true });
  }),
  http.delete(`${API}/coupons/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    return HttpResponse.json({ id: params.id, object: "coupon", deleted: true });
  }),

  http.post(`${API}/promotion_codes`, async ({ request }) => {
    const params = form(await recordCall("stripe", request));
    return HttpResponse.json({
      id: nextId("promo"),
      object: "promotion_code",
      code: params.get("code"),
      active: true,
      coupon: { id: params.get("coupon") ?? params.get("promotion[coupon]"), object: "coupon", valid: true },
    });
  }),
  http.get(`${API}/promotion_codes/:id`, async ({ request, params }) => {
    await recordCall("stripe", request);
    return HttpResponse.json({ id: params.id, object: "promotion_code", code: "SINGALONG", active: true, times_redeemed: 0 });
  }),
  http.post(`${API}/promotion_codes/:id`, async ({ request, params }) => {
    const body = form(await recordCall("stripe", request));
    return HttpResponse.json({ id: params.id, object: "promotion_code", active: body.get("active") !== "false" });
  }),
];
