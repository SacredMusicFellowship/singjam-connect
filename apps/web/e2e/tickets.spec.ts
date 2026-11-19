import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import Stripe from "stripe";
import { expect, refs, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin, createTicketedEvent } from "./support/supabase";

// The same fake secret playwright.config.ts gives the e2e server.
const WEBHOOK_SECRET = "whsec_e2e_fake";

type MockCall = { method: string; url: string; body: string };

async function emailsTo(page: Page, address: string) {
  const calls: MockCall[] = await (await page.request.get("/api/e2e/mock-calls?service=resend")).json();
  return calls.map((c) => JSON.parse(c.body)).filter((body) => [body.to].flat().includes(address));
}

async function orderFor(jamId: string, buyerId: string) {
  const { data } = await admin.from("ticket_orders").select("id, status, amount_cents").eq("jam_id", jamId).eq("buyer_user_id", buyerId).maybeSingle();
  return data;
}

// Stripe.js can't load in the browser here, so the payment step is what Stripe itself does next:
// a signed checkout.session.completed webhook.
async function payWithStripe(page: Page, orderId: string, amountCents: number) {
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

test.describe("tickets", () => {
  let event: { id: string; name: string };

  test.beforeEach(async () => {
    event = await createTicketedEvent(refs.members.host.profile.id, `Ticket Night ${randomUUID().slice(0, 6)}`);
  });

  test.afterEach(async () => {
    await admin.from("jams").delete().eq("id", event.id);
  });

  test("a member holds a paid ticket, pays through Stripe and gets the confirmation and email", async ({ page, freshMember }) => {
    await openPage(page, `/jam/${event.id}`);
    await page.getByRole("button", { name: "Add one General admission" }).click();
    await page.getByRole("button", { name: /^Buy 1 ticket/ }).click();

    await expect(page).toHaveURL(/\/tickets\/pay\?order_id=/);
    await expect.poll(async () => (await orderFor(event.id, freshMember.id))?.status).toBe("pending");
    const order = (await orderFor(event.id, freshMember.id))!;
    expect(order.amount_cents).toBe(1500);

    await payWithStripe(page, order.id, order.amount_cents);
    expect((await orderFor(event.id, freshMember.id))?.status).toBe("paid");
    const { count } = await admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", order.id);
    expect(count).toBe(1);

    // Where Stripe sends the buyer back to. A new tab, since the pay page can't finish loading
    // Stripe.js here and keeps trying to move on.
    const complete = await page.context().newPage();
    await openPage(complete, `/jam/${event.id}/tickets/complete?order_id=${order.id}`);
    await expect(complete.getByText(event.name).first()).toBeVisible();
    await expect(complete.getByRole("heading", { name: /You're in!/ })).toBeVisible();
    await expect(complete.getByText("1 ticket · $15.00")).toBeVisible();

    await expect.poll(async () => (await emailsTo(page, freshMember.email)).length).toBe(1);
    const [email] = await emailsTo(page, freshMember.email);
    expect(email.subject).toContain(event.name);
    expect(email.html).toContain("General admission");
  });

  test("a free ticket skips payment and is confirmed straight away", async ({ page, freshMember }) => {
    await openPage(page, `/jam/${event.id}`);
    await page.getByRole("button", { name: "Add one Under 12" }).click();
    await page.getByRole("button", { name: /^(Buy|Get) 1 ticket/ }).click();

    await expect(page).toHaveURL(/\/tickets\/complete\?order_id=/);
    await expect.poll(async () => (await orderFor(event.id, freshMember.id))?.status).toBe("paid");
    await expect(page.getByRole("heading", { name: /You're in!/ })).toBeVisible();
    await expect.poll(async () => (await emailsTo(page, freshMember.email)).length).toBe(1);
  });
});
