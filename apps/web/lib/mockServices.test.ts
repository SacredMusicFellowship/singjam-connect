import { beforeAll, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { mockCalls } from "@singjam/test-fixtures/msw/node";

// The SDKs make their own HTTP calls (stripe-node over node:https, Resend and OpenAI over fetch).
// These tests go through the app's real clients to prove MSW catches all of them, so no test can
// charge a card, send an email or spend API credit.

let stripe: typeof import("./stripe").stripe;
let resend: typeof import("./resend").resend;

beforeAll(async () => {
  vi.stubEnv("STRIPE_RESTRICTED_KEY", "rk_test_mock");
  vi.stubEnv("RESEND_API_KEY", "re_test_mock");
  ({ stripe } = await import("./stripe"));
  ({ resend } = await import("./resend"));
});

describe("app clients against the mocked services", () => {
  it("creates an Elements checkout session through stripe-node", async () => {
    const session = await stripe().checkout.sessions.create({
      ui_mode: "elements",
      mode: "payment",
      line_items: [{ price_data: { currency: "usd", unit_amount: 1500, product_data: { name: "General admission" } }, quantity: 1 }],
      metadata: { order_id: "order-1" },
      return_url: "https://singjam.test/return",
    } as Parameters<ReturnType<typeof stripe>["checkout"]["sessions"]["create"]>[0]);

    expect(session.client_secret).toMatch(/_secret_mock$/);
    expect(session.metadata).toEqual({ order_id: "order-1" });
    expect(new URLSearchParams(mockCalls("stripe")[0].body).get("line_items[0][price_data][unit_amount]")).toBe("1500");
  });

  it("reads a payment's Stripe fee through stripe-node", async () => {
    const intent = await stripe().paymentIntents.retrieve("pi_test_mock_1", { expand: ["latest_charge.balance_transaction"] });
    const charge = intent.latest_charge as { balance_transaction: { fee: number } };
    expect(charge.balance_transaction.fee).toBe(74);
  });

  it("sends email through the app's Resend client without it leaving the machine", async () => {
    const { data, error } = await resend.emails.send({
      from: "SingJam <hello@singjam.org>",
      to: "member@singjam.test",
      subject: "Your tickets",
      text: "See you there",
    });

    expect(error).toBeNull();
    expect(data?.id).toMatch(/^email_mock_/);
    expect(JSON.parse(mockCalls("resend")[0].body)).toMatchObject({ to: "member@singjam.test", reply_to: "events@singjam.org" });
  });

  it("answers OpenAI chat completions", async () => {
    const openai = new OpenAI({ apiKey: "sk-test-mock" });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Who wrote this song?" }],
      response_format: { type: "json_object" },
    });

    expect(JSON.parse(completion.choices[0].message.content ?? "")).toEqual({});
  });
});
