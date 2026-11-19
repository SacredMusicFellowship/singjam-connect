import path from "node:path";
import { test as base } from "@playwright/test";
import { buildScenario, type PersonaKey } from "@singjam/test-fixtures";
import { isLocalRequest } from "@singjam/test-fixtures/msw";
import { createFreshMember, deleteMember, type FreshMember } from "./support/supabase";
import { signIn } from "./support/signIn";

export { expect } from "@playwright/test";

// The same fake world the local database was seeded with: ids, names and emails line up.
export const { scenario, refs } = buildScenario();

export const authFile = (persona: PersonaKey) => path.join(import.meta.dirname, ".auth", `${persona}.json`);

type Fixtures = {
  blockOutsideRequests: void;
  // A throwaway member, already signed in on `page`, removed after the test.
  freshMember: FreshMember;
};

export const test = base.extend<Fixtures>({
  // The browser may only talk to this machine (the Next server and local Supabase). Anything else,
  // such as Stripe.js, Google Maps or a YouTube embed, is aborted so a test can't reach a real service.
  blockOutsideRequests: [
    async ({ context }, use) => {
      await context.route((url) => !isLocalRequest(url), (route) => route.abort("blockedbyclient"));
      await use();
    },
    { auto: true },
  ],
  freshMember: async ({ page }, use) => {
    const member = await createFreshMember();
    await signIn(page, member.email);
    await use(member);
    await deleteMember(member.id);
  },
});
