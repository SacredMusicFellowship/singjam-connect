import AxeBuilder from "@axe-core/playwright";
import { authFile, expect, test } from "./fixtures";
import { SCREENS } from "./support/screens";

// Accessibility problems the pages already had when these checks were added. Each listed rule is
// tolerated on that page so the suite passes today; any other WCAG A/AA violation fails it. Fixing
// one means deleting it here.
const KNOWN_A11Y: Record<string, string[]> = {
  "*": ["color-contrast"],
  jam: ["link-in-text-block"],
  "jam-community": ["link-in-text-block"],
  set: ["select-name"],
  repertoire: ["select-name"],
  "repertoire-empty": ["select-name"],
  account: ["select-name"],
  admin: ["label"],
};

for (const { name, url, as } of SCREENS) {
  test.describe(name, () => {
    if (as !== "visitor") test.use({ storageState: authFile(as) });

    test(`loads for the ${as} without errors and passes the accessibility checks`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));

      const response = await page.goto(url);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("main")).toBeVisible();
      await page.waitForLoadState("networkidle");
      expect(errors).toEqual([]);

      const known = new Set([...KNOWN_A11Y["*"], ...(KNOWN_A11Y[name] ?? [])]);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
      const unexpected = violations
        .filter((v) => !known.has(v.id))
        .map((v) => `${v.id} (${v.impact}): ${v.help} — ${v.nodes.length} element(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
      expect(unexpected, `New accessibility problems on ${url}`).toEqual([]);
    });
  });
}
