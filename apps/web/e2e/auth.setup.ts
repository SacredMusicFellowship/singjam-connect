import { PERSONAS, type PersonaKey } from "@singjam/test-fixtures";
import { authFile, refs, test } from "./fixtures";
import { signIn } from "./support/signIn";

// Signs each seeded persona in once through the real sign-in form and local Supabase Auth, and
// saves the session so specs can start already signed in with test.use({ storageState }).
for (const persona of Object.keys(PERSONAS) as PersonaKey[]) {
  test(`sign in as ${persona}`, async ({ page }) => {
    await signIn(page, refs.members[persona].auth.email);
    await page.context().storageState({ path: authFile(persona) });
  });
}
