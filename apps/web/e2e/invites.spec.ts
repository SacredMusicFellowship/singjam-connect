import { randomUUID } from "node:crypto";
import { expect, test } from "./fixtures";
import { openPage, signIn } from "./support/signIn";
import { admin, createFreshMember, createJam, deleteMember } from "./support/supabase";

test("a host invites a member to their jam and the member sees the invite", async ({ page, browser, freshMember: host }) => {
  const guest = await createFreshMember();
  const jamName = `Fixture Jam ${randomUUID().slice(0, 6)}`;
  const jam = await createJam(host.id, jamName);
  try {
    await openPage(page, "/friends");
    await page.getByPlaceholder("Search by name, username, or email").fill(guest.username);
    await page.getByRole("button", { name: "Invite to jam" }).click();
    await page.getByRole("listitem").filter({ hasText: jamName }).getByRole("button", { name: "Invite" }).click();

    await expect
      .poll(async () => (await admin.from("jam_invites").select("status").eq("jam_id", jam.id).eq("invited_user_id", guest.id)).data)
      .toEqual([{ status: "pending" }]);

    const guestContext = await browser.newContext();
    const guestPage = await guestContext.newPage();
    await signIn(guestPage, guest.email);
    await openPage(guestPage, "/notifications");
    await expect(guestPage.getByText(jamName).first()).toBeVisible();
    await guestContext.close();
  } finally {
    await admin.from("jams").delete().eq("id", jam.id);
    await deleteMember(guest.id);
  }
});
