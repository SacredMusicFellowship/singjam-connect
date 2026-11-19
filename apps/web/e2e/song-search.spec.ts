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
