import path from "node:path";
import { test as base } from "@playwright/test";
import { buildScenario, type PersonaKey } from "@singjam/test-fixtures";
import { isLocalRequest } from "@singjam/test-fixtures/msw";

export { expect } from "@playwright/test";

// The same fake world the local database was seeded with: ids, names and emails line up.
export const { refs } = buildScenario();

export const authFile = (persona: PersonaKey) => path.join(import.meta.dirname, ".auth", `${persona}.json`);

// The browser may only talk to this machine (the Next server and local Supabase). Anything else,
// such as Stripe.js, Google Maps or a YouTube embed, is aborted so a test can't reach a real service.
export const test = base.extend<{ blockOutsideRequests: void }>({
  blockOutsideRequests: [
    async ({ context }, use) => {
      await context.route((url) => !isLocalRequest(url), (route) => route.abort("blockedbyclient"));
      await use();
    },
    { auto: true },
  ],
});
