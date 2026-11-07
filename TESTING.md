# Testing

Every test in this repo runs against **fake data only**: invented members, jams, sets and songs from
`packages/test-fixtures`, a local Supabase on your machine, and mocked outside services. Nothing
reaches production, real members, Stripe, Resend or any other real service, so test output and
screenshots are safe to share in this public repo.

## Setup (once)

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or OrbStack) and start it.
2. Install the Supabase CLI: `brew install supabase/tap/supabase`
3. From the repo root:
   ```bash
   npm install
   npm run e2e:setup
   ```
   `e2e:setup` checks Node, Docker and the Supabase CLI, installs the Playwright browsers, and starts
   a local Supabase with every migration and the fake seed. Run it again whenever Docker was
   restarted.

## Commands

| Command | What it runs |
| --- | --- |
| `cd apps/web && npx vitest run` | Web unit tests (MSW answers every outside service) |
| `cd packages/core && npx vitest run` | Shared helpers |
| `cd packages/test-fixtures && npx vitest run` | Fixtures, seed and MSW handlers; replays every migration in PGlite |
| `cd apps/native && npx jest` | Native unit tests |
| `npm run test:rls` | Row-level security, signed in as fake members against local Supabase |
| `npm run e2e` | Playwright on desktop Chrome, iPhone Safari (WebKit) and Android Chrome |
| `npm run e2e:screenshots` | Every main screen at phone and desktop size into `pr-assets/<branch>/web/` |
| `npm run e2e:db:reset` | Reload the migrations and the fake seed |

CI runs all of these except the screenshots on every pull request (`.github/workflows/ci.yml`).

## The fake world

- `packages/test-fixtures` builds it deterministically: `buildScenario()` returns the same members,
  jams, sets, songs, tickets and notifications every time.
- Personas: `admin`, `host`, `member`, `newcomer` (empty repertoire), `unfinished` (profile not set
  up) and `editor`. Emails are `<persona>@singjam.test`; the password is `E2E_PASSWORD` in
  `src/constants.ts`.
- The seed SQL in `supabase/seed/e2e/` is generated from it. After changing a factory or the
  scenario, run `npm run seed:write -w @singjam/test-fixtures` and commit the result; a test fails if
  the committed seed is out of date.
- Times are written relative to `now()`, so upcoming events stay upcoming.

## Writing a Playwright test

Specs live in `apps/web/e2e/` and import `test` and `expect` from `./fixtures`, which:

- blocks every browser request that leaves the machine, and
- provides `freshMember`: a throwaway member with a finished profile, signed in on `page` and deleted
  afterwards.

Rules of thumb:

- **Anything that changes data uses `freshMember`** (or creates its own jam or event with the helpers
  in `support/supabase.ts`), so the three browsers can run in parallel and the seeded personas stay
  clean for screenshots.
- Read-only checks can sign in as a persona with `test.use({ storageState: authFile("member") })`.
- Open pages with `openPage()` from `support/signIn.ts`. It waits for hydration; typing into a form
  before React hydrates is lost, which WebKit hits often.
- Assert on what the user sees, then confirm the database with `admin` from `support/supabase.ts`.
- To check what the server sent to a mocked service (an email, a Stripe call), read
  `/api/e2e/mock-calls?service=resend`. It only exists in the e2e server.
- New main pages go in `support/screens.ts`. That one list drives both the page and accessibility
  checks and the screenshots.

## How outside services are mocked

- Handlers for Stripe, Resend, ActiveCampaign, Expo push, OpenAI, Spotify, Genius, YouTube, Google
  and the music databases live in `packages/test-fixtures/src/msw`. Unit tests in web and native
  load them in their setup files.
- The e2e web server (`next dev` on port 3100, built into `.next-e2e`, so your `npm run dev` on 3000
  is untouched) loads them through `instrumentation.ts` when `E2E=1`. Every key it reads is set to a
  fake value in `playwright.config.ts`.
- Any request to an outside host without a handler **fails the test**. A new integration needs a
  handler in `packages/test-fixtures/src/msw`.
- Stripe.js can't load in the test browser, so ticket tests finish a payment the way Stripe does: a
  correctly signed `checkout.session.completed` webhook.

## Accessibility

Every screen in `support/screens.ts` runs axe for WCAG 2 A and AA. Problems the app already had are
listed per page in `KNOWN_A11Y` in `pages.spec.ts`; anything new fails. Fixing one means removing it
from that list. Don't add to it.

## Screenshots for pull requests

`pr-assets/` is gitignored, so screenshots never appear in a PR diff. To show them in a PR
description:

1. `npm run e2e:screenshots` writes every screen to `pr-assets/<branch>/web/`. Delete the ones your
   PR doesn't change.
2. `npm run pr-assets:publish` copies `pr-assets/<branch>/` onto the orphan `pr-assets` branch (it
   never merges), pushes it, and prints `<img>` tags pinned to that commit's
   `raw.githubusercontent.com` URL.
3. Paste those into the PR description.

Screenshots show fake members only. The repo is public: never publish screenshots of production or
of real accounts.

## Troubleshooting

- **`Local Supabase isn't running`**: start Docker, then `npm run e2e:setup`.
- **Auth config changes in `supabase/config.toml` aren't picked up**: `supabase stop && supabase start`.
- **A test fails only in WebKit**: run `npx playwright test --project=iphone-safari --repeat-each 5`
  from `apps/web` and open the trace in `e2e/.report`.
- **Database in a strange state**: `npm run e2e:db:reset`.
