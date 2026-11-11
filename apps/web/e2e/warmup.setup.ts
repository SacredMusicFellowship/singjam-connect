import { refs, test } from "./fixtures";
import { signIn } from "./support/signIn";
import { SCREENS } from "./support/screens";

// next dev compiles each page on its first request, which can take longer than a test's timeouts.
// Visit every screen once (as the admin, who can see them all) before the browsers start.
test("compile every screen once before the tests run", async ({ page }) => {
  test.setTimeout(600_000);
  await signIn(page, refs.members.admin.auth.email);
  for (const { url } of SCREENS) await page.goto(url, { timeout: 180_000 });
});
