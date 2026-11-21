import { randomUUID } from "node:crypto";
import { authFile, expect, refs, test } from "./fixtures";
import { hydrated, openPage } from "./support/signIn";
import { admin, createTicketedEvent } from "./support/supabase";
import { postFromPage, takeFreeTicket } from "./support/tickets";

const ticketRow = async (id: string) =>
  (await admin.from("tickets").select("checked_in_at, checked_in_by").eq("id", id).single()).data!;

test.describe("ticket check-in", () => {
  let event: { id: string; name: string };

  test.beforeEach(async () => {
    event = await createTicketedEvent(refs.members.host.profile.id, `Door Night ${randomUUID().slice(0, 6)}`);
  });

  test.afterEach(async () => {
    await admin.from("jams").delete().eq("id", event.id);
  });

  test("a host checks a ticket holder in from the ticket manager and it counts as attendance", async ({ page, browser, freshMember }) => {
    const ticket = await takeFreeTicket(page, event.id, freshMember.id);
    expect(ticket.checked_in_at).toBeNull();

    const host = await browser.newContext({ storageState: authFile("host") });
    const hostPage = await host.newPage();
    await openPage(hostPage, `/jam/${event.id}/tickets/manage`);
    await (await hydrated(hostPage.getByPlaceholder("Search name, email or code"))).fill(freshMember.email);
    await hostPage.getByRole("button", { name: "Check in" }).click();
    await expect(hostPage.getByRole("button", { name: "✓ In" })).toHaveAttribute("aria-pressed", "true");

    await expect.poll(async () => (await ticketRow(ticket.id)).checked_in_by).toBe(refs.members.host.profile.id);
    expect((await ticketRow(ticket.id)).checked_in_at).not.toBeNull();

    // Still checked in when the door list is reloaded from the server.
    await openPage(hostPage, `/jam/${event.id}/tickets/manage`);
    await expect(hostPage.getByRole("button", { name: "✓ In" })).toBeVisible();
    await expect(hostPage.getByText("1/1")).toBeVisible();
    await host.close();

    // Attendance is recorded by the scheduled sweep once the event is over.
    const ended = Date.now() - 60 * 60 * 1000;
    await admin
      .from("jams")
      .update({ starts_at: new Date(ended - 3 * 60 * 60 * 1000).toISOString(), ends_at: new Date(ended).toISOString() })
      .eq("id", event.id);
    const { error } = await admin.rpc("record_event_attendance");
    expect(error).toBeNull();
    const { data: attendance } = await admin.from("event_attendance").select("email, user_id, source").eq("jam_id", event.id);
    expect(attendance).toEqual([{ email: freshMember.email.toLowerCase(), user_id: freshMember.id, source: "checkin" }]);
  });

  test("a member who isn't a host can't check anyone in", async ({ page, freshMember }) => {
    const ticket = await takeFreeTicket(page, event.id, freshMember.id);

    // Not found rather than forbidden, so the page doesn't confirm the event to an outsider. The
    // status is 200 because loading.tsx starts streaming before the page decides.
    await openPage(page, `/jam/${event.id}/tickets/manage`);
    await expect(page.getByRole("heading", { name: "This page could not be found." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Check in" })).toHaveCount(0);

    const res = await postFromPage(page, `/api/jam/${event.id}/tickets/checkin`, { ticket_id: ticket.id });
    expect(res).toEqual({ status: 403, json: { error: "Only the host can check guests in" } });
    expect(await ticketRow(ticket.id)).toEqual({ checked_in_at: null, checked_in_by: null });
  });
});
