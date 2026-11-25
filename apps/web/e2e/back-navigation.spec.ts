import type { Page } from "@playwright/test";
import { authFile, expect, refs, scenario, test } from "./fixtures";

test.use({ storageState: authFile("member") });

const mine = new Set(scenario.userSongs.filter((s) => s.user_id === refs.members.member.profile.id).map((s) => s.song_id));
const songsBy = new Map<string, string[]>();
for (const c of scenario.songComposers) songsBy.set(c.person_id, [...(songsBy.get(c.person_id) ?? []), c.song_id]);
// A songwriter with songs the member knows and songs they don't, so "Hide my songs" changes the list.
const writer = scenario.people.find((p) => {
  const ids = songsBy.get(p.id) ?? [];
  return ids.some((id) => mine.has(id)) && ids.filter((id) => !mine.has(id)).length >= 2;
})!;
const knownTitle = scenario.songs.find((s) => (songsBy.get(writer.id) ?? []).includes(s.id) && mine.has(s.id))!.title;

async function openSongAndComeBack(page: Page) {
  await page.locator("main").locator('a[href^="/songs/"]').first().click();
  await expect(page).toHaveURL(/\/songs\//);
  await page.goBack();
}

test("Back from a song keeps a browse page's sort, filter panel and Hide my songs", async ({ page }) => {
  await page.goto(`/search?q=${encodeURIComponent(writer.name)}`);
  await page.getByRole("list", { name: "Matching pages" }).getByRole("link", { name: new RegExp(writer.name) }).click();
  await expect(page.getByRole("heading", { name: writer.name })).toBeVisible();
  const browseUrl = page.url();

  const main = page.locator("main");
  await expect(main.getByText(knownTitle).first()).toBeVisible();
  await page.getByRole("checkbox", { name: "Hide my songs" }).check();
  await expect(main.getByText(knownTitle)).toHaveCount(0);
  await page.getByRole("button", { name: "Most known" }).click();
  await page.getByRole("button", { name: "A–Z", exact: true }).click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page).toHaveURL(/mine=hide/);
  await expect(page).toHaveURL(/filters=open/);

  await openSongAndComeBack(page);
  await expect(page).toHaveURL(new RegExp(browseUrl.split("?")[0]));
  await expect(page.getByRole("checkbox", { name: "Hide my songs" })).toBeChecked();
  await expect(main.getByText(knownTitle)).toHaveCount(0);
  await expect(page).toHaveURL(/sort=title_asc/);
  await expect(main.locator("button", { hasText: /^A–Z$/ }).and(main.locator(":not([aria-pressed])")).first()).toBeVisible();
  await expect(page.getByRole("group", { name: "Sort" })).toBeVisible();
});

test("Back from a song keeps the Song Library's filter panel and Hide my songs", async ({ page }) => {
  await page.goto("/search");
  await expect(page.locator("main").locator('a[href^="/songs/"]').first()).toBeVisible({ timeout: 15_000 });
  await page.getByRole("checkbox", { name: "Hide my songs" }).check();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(page.getByRole("group", { name: "Sort" })).toBeVisible();

  await openSongAndComeBack(page);
  await expect(page.getByRole("checkbox", { name: "Hide my songs" })).toBeChecked();
  await expect(page.getByRole("group", { name: "Sort" })).toBeVisible();
});

test("Back from a page keeps the Browse hub's A–Z order", async ({ page }) => {
  await page.goto("/browse");
  await page.getByRole("button", { name: "A–Z" }).click();
  await expect(page.getByRole("button", { name: "A–Z" })).toHaveAttribute("aria-pressed", "true");

  await page.locator("main").getByRole("link").filter({ hasText: /\d/ }).first().click();
  await expect(page).not.toHaveURL(/\/browse/);
  await page.goBack();
  await expect(page.getByRole("button", { name: "A–Z" })).toHaveAttribute("aria-pressed", "true");
});
