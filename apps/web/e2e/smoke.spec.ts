import { authFile, expect, refs, test } from "./fixtures";

test.describe("signed out", () => {
  test("the home page loads and offers sign in", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/SingJam/);
    await expect(page.getByRole("link", { name: /sign in/i }).first()).toBeVisible();
  });
});

test.describe("signed in as a newcomer with no invites", () => {
  test.use({ storageState: authFile("newcomer") });

  test("the jams list shows official jams but not someone else's private jam", async ({ page }) => {
    await page.goto("/jams");
    await expect(page.getByText(refs.jams.officialNext.name).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(refs.jams.privateUpcoming.name)).toHaveCount(0);
  });
});

test.describe("signed in as the member", () => {
  test.use({ storageState: authFile("member") });

  test("their repertoire loads from the seed", async ({ page }) => {
    await page.goto("/repertoire");
    await expect(page).toHaveURL(/\/repertoire/);
    await expect(page.getByText(refs.songs[0].title).first()).toBeVisible({ timeout: 15_000 });
  });

  test("the invited private jam is visible", async ({ page }) => {
    await page.goto(`/jam/${refs.jams.privateUpcoming.id}`);
    await expect(page.getByText(refs.jams.privateUpcoming.name).first()).toBeVisible();
  });

  test("the server answers Google Places from MSW, not the real API", async ({ page }) => {
    const response = await page.request.get("/api/timezone?address=1 Fake Street");
    expect(await response.json()).toEqual({ timezone: "America/Los_Angeles" });
  });
});
