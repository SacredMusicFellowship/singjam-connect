import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import Stripe from "stripe";
import { openPage } from "./signIn";
import { admin } from "./supabase";

// The same fake secret playwright.config.ts gives the e2e server.
const WEBHOOK_SECRET = "whsec_e2e_fake";

type MockCall = { method: string; url: string; body: string };

// What the server sent to a mocked outside service.
export async function mockCalls(page: Page, service: "resend" | "stripe"): Promise<MockCall[]> {
  return (await page.request.get(`/api/e2e/mock-calls?service=${service}`)).json();
}

export async function emailsTo(page: Page, address: string) {
  const calls = await mockCalls(page, "resend");
  return calls.map((c) => JSON.parse(c.body)).filter((body) => [body.to].flat().includes(address));
}

export async function orderFor(jamId: string, buyerId: string) {
  const { data } = await admin
    .from("ticket_orders")
    .select("id, status, amount_cents, promo_code_id")
    .eq("jam_id", jamId)
    .eq("buyer_user_id", buyerId)
    .maybeSingle();
  return data;
}

// A JSON POST from inside the page, so it goes with the signed-in member's session exactly as the
// app's own requests do.
export async function postFromPage(page: Page, url: string, body: unknown) {
  return page.evaluate(
    async ([url, body]) => {
      const res = await fetch(url as string, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: await res.json() };
    },
    [url, body] as const,
  );
}

// Takes one free "Under 12" ticket on a createTicketedEvent event, as the member signed in on `page`.
export async function takeFreeTicket(page: Page, jamId: string, buyerId: string) {
  await openPage(page, `/jam/${jamId}`);
  await page.getByRole("button", { name: "Add one Under 12" }).click();
  await page.getByRole("button", { name: /^(Buy|Get) 1 ticket/ }).click();
  await expect(page).toHaveURL(/\/tickets\/complete\?order_id=/);
  await expect.poll(async () => (await orderFor(jamId, buyerId))?.status).toBe("paid");
  const { data: ticket } = await admin
    .from("tickets")
    .select("id, checked_in_at, checked_in_by")
    .eq("order_id", (await orderFor(jamId, buyerId))!.id)
    .single();
  return ticket!;
}

// Stripe.js can't load in the browser here, so the payment step is what Stripe itself does next:
// a signed checkout.session.completed webhook.
export async function payWithStripe(page: Page, orderId: string, amountCents: number) {
  const payload = JSON.stringify({
    id: `evt_e2e_${randomUUID()}`,
    object: "event",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_e2e_${randomUUID()}`,
        object: "checkout.session",
        payment_status: "paid",
        amount_total: amountCents,
        payment_intent: `pi_e2e_${randomUUID()}`,
        client_reference_id: orderId,
        metadata: { order_id: orderId },
      },
    },
  });
  const signature = new Stripe("sk_test_e2e_fake").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
  const res = await page.request.post("/api/stripe/webhook", {
    data: payload,
    headers: { "content-type": "application/json", "stripe-signature": signature },
  });
  expect(await res.json()).toEqual({ received: true });
}
