import { expect, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

const repertoireCount = async (userId: string) =>
  (await admin.from("user_songs").select("song_id", { count: "exact", head: true }).eq("user_id", userId)).count;

test("a new member adds a suggested song to their repertoire and removes it", async ({ page, freshMember }) => {
  await openPage(page, "/repertoire");
  await expect(page.getByText("Your repertoire is empty")).toBeVisible();

  const suggestion = page.getByRole("link", { name: "Paper Boats" });
  await expect(suggestion).toBeVisible();
  await page.getByRole("button", { name: "Want to learn it" }).first().click();
  await expect(page.getByText("1 song", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Confidence" })).toHaveValue("learn");
  await expect.poll(() => repertoireCount(freshMember.id)).toBe(1);

  await page.getByRole("checkbox", { name: "Select Paper Boats" }).check();
  await page.getByRole("button", { name: /^Remove/ }).click();
  await expect(page.getByText("Remove 1 song?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("0 songs", { exact: true })).toBeVisible();
  await expect.poll(() => repertoireCount(freshMember.id)).toBe(0);
});
