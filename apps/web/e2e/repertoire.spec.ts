import { expect, test } from "./fixtures";
import { openPage } from "./support/signIn";
import { admin } from "./support/supabase";

const repertoireCount = async (userId: string) =>
  (await admin.from("user_songs").select("song_id", { count: "exact", head: true }).eq("user_id", userId)).count;

test("a new member adds a suggested song to their repertoire and removes it", async ({ page, freshMember }) => {
  await openPage(page, "/repertoire");
  await expect(page.getByText("Your repertoire is empty")).toBeVisible();

  await expect(page.getByText("Songs you might know")).toBeVisible();
  await page.getByRole("button", { name: "Want to learn it" }).first().click();
  await expect(page.getByText("1 song", { exact: true })).toBeVisible();
  await expect.poll(() => repertoireCount(freshMember.id)).toBe(1);

  // Whichever song was suggested first: read its title back from the repertoire row.
  const select = page.getByRole("checkbox", { name: /^Select (?!all$)/ });
  const title = ((await select.getAttribute("aria-label")) ?? (await select.evaluate((el) => (el as HTMLInputElement).labels?.[0]?.textContent ?? ""))).replace(/^Select /, "");
  await expect(page.getByRole("combobox", { name: `Role for ${title}` })).toHaveValue("learn");

  await select.check();
  await page.getByRole("button", { name: /^Remove/ }).click();
  await expect(page.getByText("Remove 1 song?")).toBeVisible();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("0 songs", { exact: true })).toBeVisible();
  await expect.poll(() => repertoireCount(freshMember.id)).toBe(0);
});
