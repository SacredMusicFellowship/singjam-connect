import { E2E_PASSWORD, PERSONAS, type PersonaKey } from "@singjam/test-fixtures";
import { authFile, expect, refs, test } from "./fixtures";

// Signs each seeded persona in once through the real sign-in form and local Supabase Auth, and
// saves the session so specs can start already signed in with test.use({ storageState }).
for (const persona of Object.keys(PERSONAS) as PersonaKey[]) {
  test(`sign in as ${persona}`, async ({ page }) => {
    await page.goto("/auth");
    await page.locator('input[type="email"]').fill(refs.members[persona].auth.email);
    await page.locator('input[type="password"]').fill(E2E_PASSWORD);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).not.toHaveURL(/\/auth/, { timeout: 30_000 });
    await page.context().storageState({ path: authFile(persona) });
  });
}
