import { randomUUID } from "node:crypto";
import { expect, refs, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin, createTicketedEvent } from "./support/supabase";
import { emailsTo, orderFor, payWithStripe } from "./support/tickets";

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
