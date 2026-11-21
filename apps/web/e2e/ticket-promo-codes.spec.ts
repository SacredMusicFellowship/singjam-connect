import { randomUUID } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { FIXTURE_PROMOTION_CODES } from "@singjam/test-fixtures/msw";
import { authFile, expect, refs, test } from "./fixtures";
import { hydrated, openPage } from "./support/signIn";
import { admin, createTicketedEvent } from "./support/supabase";
import { mockCalls, orderFor, payWithStripe, postFromPage } from "./support/tickets";

const uniqueCode = (prefix: string) => `${prefix}${randomUUID().slice(0, 8).toUpperCase()}`;

// Made by the host through the ticket manager's API, so the Stripe coupon and promotion code exist
// in the mock as they would in Stripe.
async function hostCreatesCode(browser: Browser, jamId: string, code: string, percentOff: number) {
  const host = await browser.newContext({ storageState: authFile("host") });
  const res = await host.request.post(`/api/jam/${jamId}/tickets/promos`, { data: { code, percent_off: percentOff } });
  expect(res.ok(), await res.text()).toBe(true);
  await host.close();
  const { data } = await admin
    .from("ticket_promo_codes")
    .select("id, stripe_promotion_code_id")
    .eq("jam_id", jamId)
    .eq("code", code)
    .single();
  return data!;
}

async function selectGeneralAdmission(page: Page, jamId: string) {
  await openPage(page, `/jam/${jamId}`);
  await page.getByRole("button", { name: "Add one General admission" }).click();
  await page.getByRole("button", { name: "Promo Code" }).click();
}

async function applyCode(page: Page, code: string) {
  await (await hydrated(page.getByPlaceholder("Promo code"))).fill(code);
  await page.getByRole("button", { name: "Apply" }).click();
}

async function checkoutSessionsFor(page: Page, orderId: string) {
  const calls = await mockCalls(page, "stripe");
  return calls
    .filter((c) => c.method === "POST" && c.url.endsWith("/v1/checkout/sessions"))
    .map((c) => new URLSearchParams(c.body))
    .filter((params) => params.get("client_reference_id") === orderId);
}

test.describe("ticket promo codes", () => {
  let event: { id: string; name: string };

  test.beforeEach(async () => {
    event = await createTicketedEvent(refs.members.host.profile.id, `Promo Night ${randomUUID().slice(0, 6)}`);
  });

  test.afterEach(async () => {
    await admin.from("jams").delete().eq("id", event.id);
  });

  test("a valid code discounts the total, goes to Stripe and is recorded on the order", async ({ page, browser, freshMember }) => {
    const code = uniqueCode("HALF");
    const promo = await hostCreatesCode(browser, event.id, code, 50);

    await selectGeneralAdmission(page, event.id);
    await applyCode(page, code.toLowerCase());
    await expect(page.getByText(`${code} applied · 50% off · −$7.50`)).toBeVisible();

    await page.getByRole("checkbox", { name: /Cover the .* processing fee/ }).uncheck();
    await page.getByRole("button", { name: "Buy 1 ticket · $7.50" }).click();

    await expect(page).toHaveURL(/\/tickets\/pay\?order_id=/);
    await expect.poll(async () => (await orderFor(event.id, freshMember.id))?.promo_code_id).toBe(promo.id);
    const order = (await orderFor(event.id, freshMember.id))!;
    expect(order.status).toBe("pending");

    const [session] = await checkoutSessionsFor(page, order.id);
    expect(session.get("discounts[0][promotion_code]")).toBe(promo.stripe_promotion_code_id);

    // Stripe charges the discounted total, and the webhook records what it charged.
    await payWithStripe(page, order.id, 750);
    expect(await orderFor(event.id, freshMember.id)).toMatchObject({ status: "paid", amount_cents: 750, promo_code_id: promo.id });
  });

  test("an expired code and a fully redeemed code are refused", async ({ page, freshMember }) => {
    const expired = uniqueCode("OLD");
    const usedUp = uniqueCode("GONE");
    // The host's form can't set an expiry or a limit, so these point at Stripe codes the mock
    // already holds in that state.
    const { error } = await admin.from("ticket_promo_codes").insert(
      [
        { code: expired, stripe: FIXTURE_PROMOTION_CODES.expired },
        { code: usedUp, stripe: FIXTURE_PROMOTION_CODES.fullyRedeemed },
      ].map(({ code, stripe }) => ({
        jam_id: event.id,
        code,
        stripe_promotion_code_id: stripe.id,
        stripe_coupon_id: stripe.coupon!.id,
        label: "50% off",
      })),
    );
    expect(error).toBeNull();

    await selectGeneralAdmission(page, event.id);
    await applyCode(page, expired);
    await expect(page.getByRole("alert").filter({ hasText: /code/ })).toHaveText("That code has expired");
    await applyCode(page, usedUp);
    await expect(page.getByRole("alert").filter({ hasText: /code/ })).toHaveText("That code has been fully redeemed");
    await expect(page.getByText(/applied ·/)).toHaveCount(0);

    // The page only sends a code it applied, so also try both straight at checkout.
    const { data: tiers } = await admin.from("ticket_types").select("id").eq("jam_id", event.id).eq("name", "General admission");
    for (const [code, reason] of [
      [expired, "That code has expired"],
      [usedUp, "That code has been fully redeemed"],
    ]) {
      const res = await postFromPage(page, `/api/jam/${event.id}/tickets/checkout`, {
        items: [{ ticket_type_id: tiers![0].id, quantity: 1 }],
        promo_code: code,
      });
      expect(res).toEqual({ status: 400, json: { error: reason } });
    }
    const { data: orders } = await admin.from("ticket_orders").select("status").eq("jam_id", event.id).eq("buyer_user_id", freshMember.id);
    expect(orders!.map((o) => o.status)).toEqual(["failed", "failed"]);
  });

  test("a 100%-off code skips payment and confirms the ticket straight away", async ({ page, browser, freshMember }) => {
    const code = uniqueCode("FREE");
    const promo = await hostCreatesCode(browser, event.id, code, 100);

    await selectGeneralAdmission(page, event.id);
    await applyCode(page, code);
    await expect(page.getByText(`${code} applied · 100% off · −$15.00`)).toBeVisible();
    await page.getByRole("button", { name: "Buy 1 ticket · $0.00" }).click();

    await expect(page).toHaveURL(/\/tickets\/complete\?order_id=/);
    await expect(page.getByRole("heading", { name: /You're in!/ })).toBeVisible();
    const order = (await orderFor(event.id, freshMember.id))!;
    expect(order).toMatchObject({ status: "paid", amount_cents: 0, promo_code_id: promo.id });
    expect(await checkoutSessionsFor(page, order.id)).toHaveLength(0);

    // Stripe never sees a free order, so the ticket manager counts it from the order itself.
    const host = await browser.newContext({ storageState: authFile("host") });
    const hostPage = await host.newPage();
    await openPage(hostPage, `/jam/${event.id}/tickets/manage`);
    await expect(hostPage.getByText(code, { exact: true })).toBeVisible();
    await expect(hostPage.getByText("100% off · Used 1 time")).toBeVisible();
    await host.close();
  });
});
