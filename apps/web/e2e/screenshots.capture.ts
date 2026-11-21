import { execFileSync } from "node:child_process";
import path from "node:path";
import { authFile, expect, test } from "./fixtures";
import { SCREENS } from "./support/screens";

// npm run e2e:screenshots photographs every main screen with the fake seed, at phone and desktop
// size, into pr-assets/<branch>/web/ so a PR can link real, shareable screenshots.
const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
const outDir = process.env.E2E_SCREENSHOTS_DIR ?? path.join(import.meta.dirname, "..", "..", "..", "pr-assets", branch, "web");

for (const { name, url, as } of SCREENS) {
  test.describe(name, () => {
    if (as !== "visitor") test.use({ storageState: authFile(as) });

    test(`capture ${name}`, async ({ page }, testInfo) => {
      const size = testInfo.project.name.replace("screenshots-", "");
      await page.goto(url);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: path.join(outDir, `${name}-${size}.png`), fullPage: true, animations: "disabled" });
    });
  });
}
