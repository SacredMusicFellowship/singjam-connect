# Claude Instructions for singjam-connect

singjam-connect is a platform for musicians to find jam partners based on shared repertoire.

## Branching

- Never commit directly to `main`
- All work — including small fixes — must be done in a new branch
- Branch names should follow the pattern: `type/short-description` (e.g. `feat/jam-invite`, `fix/auth-redirect`, `chore/update-deps`)
- Open a pull request to merge into `main`

## Commit Messages

Use a hybrid of conventional and descriptive style:
- Prefix with a type: `feat:`, `fix:`, `chore:`, `refactor:`, `docs:`
- Follow with a short, plain-English description of what changed and why
- Example: `feat: add match score to jam card so users can prioritise by compatibility`

## Code Style

- Use **server components** by default; only use `"use client"` when interactivity is required
- Use **Tailwind CSS** for all styling — no inline styles
- Third-party UI libraries require explicit approval before being added — propose in a PR description or issue first
- Keep solutions simple — do not add features, abstractions, or refactors beyond what was asked
- Do not add comments unless the logic is genuinely non-obvious

## Web / Native Parity

The native app (`apps/native`) is the mobile companion to the web app (`apps/web`). It should look and behave like the mobile web experience, plus native-only capabilities (local data caching, push notifications).

- Before building or changing a native screen, review the mobile web version of the same page and match its behavior and visual hierarchy
- Business rules must live in exactly one place — a web API route, a Supabase RPC, or `packages/core` — never implemented separately in both apps
- When changing a shared flow (RSVPs, invites, notifications, repertoire or set mutations), grep the other app for the same logic and update both sides in the same PR
- Pure helpers (formatting, sorting, search normalization) belong in `packages/core`, with their tests in the package

## Database

- All schema changes **must** include a new migration file in `supabase/migrations/`
- Never modify the schema directly via the Supabase dashboard without a corresponding migration file
- Migration files should be named with an incrementing number prefix: `002_description.sql`
- Every migration that creates a new table **must** include explicit grants — Supabase no longer auto-grants access to the Data API:
  ```sql
  grant select on public.your_table to anon;
  grant select, insert, update, delete on public.your_table to authenticated;
  grant select, insert, update, delete on public.your_table to service_role;
  ```

- `public.jams` uses **column-level** select grants for `anon`/`authenticated` (migration 175) so `full_address` stays private. A migration that adds a column to `jams` must also `grant select (new_col) on public.jams to anon, authenticated;` if clients read it, and clients must never `select('*')` from `jams`. Clients read the address only through `jam_full_address(jam_id)`

## Querying Lists

- Never cap a query that renders a **complete** list with a hardcoded `.limit(n)` — the row count grows and the tail silently disappears. Use `fetchAllRows` from `packages/core`, which pages until the table is exhausted and throws instead of truncating on error
- `.limit(n)` is fine for genuinely bounded things: search results, top-N suggestions, `.limit(1)` existence checks, and batch drains
- Any paged or offset-based query **must** sort on a unique tiebreaker (`.order('title').order('id')`, or `order by … , f.id asc` in SQL). Sorting on a non-unique column alone lets rows shift across page boundaries and get duplicated or skipped
- Never derive a count or an at-capacity check from the length of a capped fetch — query the count directly or fetch unbounded

## Testing

- All new features must include tests before merging
- Focus especially on: auth flows, data mutations, and matching logic
- See [TESTING.md](TESTING.md). Run `npm run e2e:setup` once; everything runs against a local Supabase and fake data
- **Fake data only.** Tests, seeds and screenshots use `packages/test-fixtures`. Never use real members, production data or real service keys in a test, fixture or PR
- A new or changed user-facing flow gets a Playwright spec in `apps/web/e2e/`. Specs that change data use the `freshMember` fixture (or their own jam/event) so browsers can run in parallel
- A new outside service needs an MSW handler in `packages/test-fixtures/src/msw`. Unmocked outside requests fail the tests
- A new main page goes in `apps/web/e2e/support/screens.ts` so it gets page, accessibility and screenshot coverage. Don't add entries to `KNOWN_A11Y`
- After changing a fixture factory or the scenario, run `npm run seed:write -w @singjam/test-fixtures` and commit the regenerated seed
- Before opening a PR, run the unit tests for what you touched, plus `npm run e2e` for any UI or flow change

## Pull Requests

Every PR must include:
- **What changed** — a clear summary of the changes
- **Why** — the motivation or context behind the change
- **Screenshots** — before/after visuals for any UI changes, taken with `npm run e2e:screenshots` (fake data only; commit just the screens the PR changes from `pr-assets/<branch>/web/`)
- **Verification steps** — how to manually test or confirm the change works
- **Build check** — confirm `npm run build` passes locally before opening the PR
