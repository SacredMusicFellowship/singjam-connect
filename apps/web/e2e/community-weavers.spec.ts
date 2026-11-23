import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { hydrated, openPage } from "./support/signIn";
import { admin, createTicketedEvent } from "./support/supabase";

type MockCall = { method: string; url: string; body: string };

async function emailsTo(page: Page, address: string) {
  const calls: MockCall[] = await (await page.request.get("/api/e2e/mock-calls?service=resend")).json();
  return calls.map((c) => JSON.parse(c.body)).filter((body) => [body.to].flat().includes(address));
}

// The panel is the heading's block's parent.
const weaverPanel = (page: Page) => page.getByRole("heading", { name: "Community Weavers" }).locator("xpath=../..");

test.describe("Community Weavers", () => {
  let event: { id: string; name: string };

  test.afterEach(async () => {
    if (event) await admin.from("jams").delete().eq("id", event.id);
  });

  test("a host adds a guest as a Community Weaver, who gets a free ticket by email", async ({ page, freshMember }) => {
    event = await createTicketedEvent(freshMember.id, `Weaver Night ${randomUUID().slice(0, 6)}`);
    const email = `weaver-${randomUUID().slice(0, 8)}@singjam.test`;

    await openPage(page, `/jam/${event.id}`);
    const panel = weaverPanel(page);
    await (await hydrated(panel.getByPlaceholder("Name", { exact: true }))).fill("Wren Weaver");
    await panel.getByPlaceholder("Email", { exact: true }).fill(email);
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    // Adding refreshes the page, which can clear the confirmation, so check the database.
    await expect.poll(async () => {
      const { count } = await admin.from("jam_leaders").select("id", { count: "exact", head: true }).eq("jam_id", event.id);
      return count;
    }).toBe(1);

    const { data: row } = await admin.from("jam_leaders").select("role, order_id").eq("jam_id", event.id).eq("email", email).single();
    expect(row?.role).toBe("weaver");
    const { data: order } = await admin.from("ticket_orders").select("source, status, amount_cents").eq("id", row!.order_id!).single();
    expect(order).toEqual({ source: "leader", status: "paid", amount_cents: 0 });

    const [mail] = await emailsTo(page, email);
    expect(mail.subject).toBe(`You're a Community Weaver at ${event.name}`);
  });

  test("a member added as a Community Weaver is badged in Who's going and can step down", async ({ page, freshMember }) => {
    event = await createTicketedEvent(freshMember.id, `Weaver Night ${randomUUID().slice(0, 6)}`);

    await openPage(page, `/jam/${event.id}`);
    const panel = weaverPanel(page);
    await (await hydrated(panel.getByPlaceholder("Search by name or username"))).fill(freshMember.username);
    await panel.getByRole("listitem").filter({ hasText: `@${freshMember.username}` }).getByRole("button", { name: "Add" }).click();
    await expect.poll(async () => {
      const { data } = await admin.from("jam_leaders").select("role").eq("jam_id", event.id).eq("user_id", freshMember.id).maybeSingle();
      return data?.role;
    }).toBe("weaver");
    await openPage(page, `/jam/${event.id}`);

    const whosGoing = page.locator("#whos-going");
    await expect(whosGoing.getByText("Community Weaver", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Can't make it?" }).click();
    await expect(page.getByText(/Step down as a Community Weaver\?/)).toBeVisible();
    await page.getByRole("button", { name: "Step down" }).click();

    await expect.poll(async () => {
      const { count } = await admin.from("jam_leaders").select("id", { count: "exact", head: true }).eq("jam_id", event.id);
      return count;
    }).toBe(0);
  });
});
