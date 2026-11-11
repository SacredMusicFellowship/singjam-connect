import { expect, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

test("a member creates a set, adds a song and deletes the set", async ({ page, freshMember }) => {
  await openPage(page, "/set/new");
  await page.getByPlaceholder("e.g. Friday night gig").fill("Porch rehearsal");
  await page.getByRole("button", { name: "Create set" }).click();
  await expect(page.getByRole("heading", { name: "Porch rehearsal", level: 1 })).toBeVisible();

  const { data: set } = await admin.from("sets").select("id").eq("owner_user_id", freshMember.id).single();

  await page.getByPlaceholder("Search songs…").fill("Paper Boats");
  await page.getByRole("listitem").filter({ hasText: "Paper Boats" }).getByRole("button", { name: "Add to set list" }).click();
  // The new member doesn't know the song yet, so the set asks how well they know it.
  await page.getByRole("button", { name: "Learn", exact: true }).click();
  await expect
    .poll(async () => (await admin.from("set_songs").select("id", { count: "exact", head: true }).eq("set_id", set!.id)).count)
    .toBe(1);

  await expect(page.getByRole("link", { name: "Paper Boats" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Delete set" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page).toHaveURL(/\/sets/, { timeout: 15_000 });
  await expect.poll(async () => (await admin.from("sets").select("id").eq("id", set!.id)).data?.length).toBe(0);
});
