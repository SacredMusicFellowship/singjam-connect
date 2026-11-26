import { expect, scenario, test } from "./fixtures";

// The songwriter with the most songs in the fake catalogue.
const songCount = new Map<string, number>();
for (const c of scenario.songComposers) songCount.set(c.person_id, (songCount.get(c.person_id) ?? 0) + 1);
const writer = [...scenario.people].sort((a, b) => (songCount.get(b.id) ?? 0) - (songCount.get(a.id) ?? 0))[0];
const count = songCount.get(writer.id) ?? 0;

test("searching a songwriter's name offers their page above the songs", async ({ page }) => {
  await page.goto("/search");
  await page.getByPlaceholder(/search by title/i).fill(writer.name);

  const pages = page.getByRole("list", { name: "Matching pages" });
  const row = pages.getByRole("link", { name: new RegExp(writer.name) });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText(`Songwriter · ${count} song${count === 1 ? "" : "s"}`);

  await row.click();
  await expect(page).toHaveURL(/\/people\//);
  await expect(page.getByRole("heading", { name: writer.name })).toBeVisible();
});

test("a search that names no page shows no page rows", async ({ page }) => {
  await page.goto("/search");
  await page.getByPlaceholder(/search by title/i).fill("zzzz-no-such-name");
  await expect(page.getByText("No songs found.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("list", { name: "Matching pages" })).toHaveCount(0);
});

test("a search link opens with its query, and Back from a song keeps it", async ({ page }) => {
  const query = writer.name.split(" ").pop()!;
  await page.goto(`/search?q=${encodeURIComponent(query)}`);
  await expect(page.getByPlaceholder(/search by title/i)).toHaveValue(query);
  await expect(page.getByRole("list", { name: "Matching pages" })).toBeVisible({ timeout: 15_000 });

  await page.locator('a[href^="/songs/"]').first().click();
  await expect(page).toHaveURL(/\/songs\//);
  await page.goBack();
  await expect(page.getByPlaceholder(/search by title/i)).toHaveValue(query);
  await expect(page).toHaveURL(new RegExp(`q=${query}`));
});

test("an ilahi's card names its maqam, usul and poet, and its score sits in the chart slot", async ({ page }) => {
  const ilahi = scenario.songs.find((s) => s.score_url)!;
  await page.goto(`/search?q=${encodeURIComponent(ilahi.title)}`);

  const card = page.getByRole("link", { name: ilahi.title, exact: true }).first().locator("xpath=ancestor::div[contains(@class, 'rounded-2xl')][1]");
  await expect(card).toContainText("(Derviş Hasan Nuri)", { timeout: 30_000 });
  await expect(card).toContainText("Maqam: Hicaz · Usul: Sofyan");
  await card.getByRole("link", { name: "Hicaz" }).click();
  await expect(page).toHaveURL(/\/modes\/hicaz$/);
  await expect(page.getByRole("heading", { name: "Hicaz" })).toBeVisible();

  await page.goto(`/songs/${ilahi.slug}`);
  await expect(page.getByRole("link", { name: "Score" }).first()).toHaveAttribute("href", ilahi.score_url!);
  await expect(page.getByText("Maqam", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Sofyan" })).toBeVisible();
});
