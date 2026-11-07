import AxeBuilder from "@axe-core/playwright";
import type { PersonaKey } from "@singjam/test-fixtures";
import { authFile, expect, refs, test } from "./fixtures";

// Accessibility problems the pages already had when these checks were added. Each listed rule is
// tolerated on that page so the suite passes today; any other WCAG A/AA violation fails it. Fixing
// one means deleting it here.
const KNOWN_A11Y: Record<string, string[]> = {
  "*": ["color-contrast"],
  jam: ["link-in-text-block"],
  set: ["select-name"],
  repertoire: ["select-name"],
  account: ["select-name"],
  admin: ["label"],
};

const PAGES: { name: string; url: string; as: PersonaKey }[] = [
  { name: "home", url: "/", as: "member" },
  { name: "jams", url: "/jams", as: "member" },
  { name: "jam", url: `/jam/${refs.jams.officialNext.id}`, as: "member" },
  { name: "sets", url: "/sets", as: "member" },
  { name: "set", url: `/set/${refs.sets.memberShared.id}`, as: "member" },
  { name: "songs", url: "/songs", as: "member" },
  { name: "song", url: `/songs/${refs.songs[0].slug}`, as: "member" },
  { name: "friends", url: "/friends", as: "member" },
  { name: "repertoire", url: "/repertoire", as: "member" },
  { name: "notifications", url: "/notifications", as: "member" },
  { name: "profile", url: "/profile", as: "member" },
  { name: "account", url: "/account", as: "member" },
  { name: "admin", url: "/admin", as: "admin" },
];

for (const { name, url, as } of PAGES) {
  test.describe(name, () => {
    test.use({ storageState: authFile(as) });

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
