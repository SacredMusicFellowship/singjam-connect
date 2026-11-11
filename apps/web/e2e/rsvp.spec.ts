import { expect, refs, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

const jam = refs.jams.communityUpcoming;

async function rsvpStatus(jamId: string, userId: string) {
  const { data } = await admin.from("jam_rsvps").select("status").eq("jam_id", jamId).eq("user_id", userId).maybeSingle();
  return data?.status ?? null;
}

test("a member RSVPs to a community jam, sees the full address, then cancels", async ({ page, freshMember }) => {
  await openPage(page, `/jam/${jam.id}`);
  await expect(page.getByText("Full address shown after RSVP")).toBeVisible();

  await page.getByRole("button", { name: "RSVP" }).click();
  await page.getByRole("button", { name: "I'm going" }).click();
  await expect(page.getByText("You're going")).toBeVisible();
  await expect(page.getByText(jam.full_address!).first()).toBeVisible();
  await expect.poll(() => rsvpStatus(jam.id, freshMember.id)).toBe("attending");

  await page.getByRole("button", { name: "Cancel RSVP" }).click();
  await expect(page.getByRole("button", { name: "RSVP" })).toBeVisible();
  await expect.poll(() => rsvpStatus(jam.id, freshMember.id)).not.toBe("attending");
});
