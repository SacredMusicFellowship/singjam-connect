# Native ↔ Mobile-Web Parity Checklist

The native app (`apps/native`) should look and behave like the **mobile web** experience
(`apps/web`), plus native-only capabilities (local caching, push). This is the living
inventory of that parity — **update it in the same PR as any change to a listed flow.**

## How we work on parity (to avoid churn + credit burn)

1. **One screen at a time, driven by this file.** No mass multi-agent "audit everything"
   sweeps — those are slow, unreliable, and expensive. Pick a `⚠️`/`❌` row, compare that
   one screen's web vs native, fix, tick it.
2. **Shared *logic* lives in `packages/core`, not reimplemented per app.** Rules (filter
   matching, option cascading, sort, confidence/lead gating, formatting, search
   normalization) go in core with unit tests; both apps import them so they can't drift.
   UI (RN vs HTML) stays per-app. See "Core-extraction backlog" below.
3. **Business mutations live in one place** (web API route / Supabase RPC / core) — native
   calls them (Bearer pattern), never reimplements. Per CLAUDE.md.
4. **Batch web-affecting merges.** Native-only changes now auto-skip Netlify builds
   (netlify.toml `ignore`), so they're free; web-affecting changes cost a build — bundle them.
5. **Keep native mobile-idiomatic where it's clearly better** (ActionSheet for pickers,
   full-screen filter sheets vs web's inline panels). Parity ≠ pixel-copy; it's behavior +
   visual hierarchy. When native intentionally diverges, note it in the row.

Legend: ✅ at parity · ⚠️ partial / known diff · ❌ missing · 🚫 desktop-only (open in browser) · ❓ not yet verified

## Screens & flows

### Repertoire (`apps/native/app/(tabs)/index.tsx` ↔ web `/repertoire`)
| Feature | Status | Notes |
|---|---|---|
| Sort (A→Z / Z→A / Popular) | ✅ | Native ActionSheet vs web dropdown — intentional. |
| Confidence/role filter | ✅ | ActionSheet vs web `<select>`. |
| Extended filters (genre/culture/language/theme/vibe/tonality/meter) | ✅ | Full-screen sheet vs web inline panel — intentional. |
| Year range filter | ✅ | Added 2026-07-20 (PR consolidated in 7740057). |
| Cascading filter options | ✅ | Added 2026-07-20 — each dimension derived from songs passing other filters. |
| Signed-out view | ✅ | Fixed 2026-07-29. Native showed the generic `SignInPrompt` lock wall; web keeps the "My Repertoire" heading + subtitle and pitches the feature ("Track the songs you know" → Sign in). Native now matches. This is the app's **initial route**, so it was the first screen a guest saw. All four tabs' guest/empty cards now come from one `components/PromptCard.tsx` (web's two card shapes: `guest` = roomy + amber text link, `nudge` = amber filled button), so they can't drift apart again. `SignInPrompt` survives only for the screens that are genuinely account-only (notifications, account, profile). |
| Empty-repertoire state | ✅ | Copy matches web ("Your repertoire is empty" + "Search for a song above, or pick one from the suggestions below"), with the suggestions list below it. Native additionally keeps the collapsed submit-a-song panel while searching — intentional. |
| Add-song search (ranked) | ✅ | `search_songs` RPC; lead-gating on `singing_voice`. |
| Add-song rows (composers + jammers) | ✅ | Via `formatComposers` + popularity. |
| Suggestions ("Songs you might know") | ✅ | `SuggestionCard`, infinite scroll (PR #241). |
| Submit a missing song | ✅ | `SubmitMissingSong` → `/api/songs/submit` (bearer). Mobile-simplified: no Spotify-preview step. |

### Song Library / Search (`apps/native/app/songs.tsx` ↔ web `/search`)
| Feature | Status | Notes |
|---|---|---|
| Signed-out view | ✅ | Verified 2026-07-29 — neither app gates the catalog: guests browse and search, and tapping a role on a row routes to sign-in (web `/auth?next=`, native `/(auth)/sign-in`) instead of upserting. No sign-in card on either side, by design; the catalog *is* the pitch. |
| Empty-repertoire state | ✅ | Verified 2026-07-29 — "Hide my songs" is hidden on both sides until you have at least one song, and neither app shows an empty-repertoire nudge here (you are already in the place that fixes it). |
| Sort on toolbar | ✅ | Moved out of the filter modal 2026-07-20. |
| Filters + Year + cascading | ✅ | Same as repertoire. |
| Result rows (composers/artist/jammers) | ✅ | Rebuilt 2026-07-28 to reuse `SuggestionCard` (native's web-`SongCard` mirror): bordered card, title + (songwriters) — production/artist (year), genre chips + jammer count. Replaced the old thin `border-b` rows. |
| Search card + result count | ✅ | Added 2026-07-28 — web's bordered search panel with the "N song(s)" line; scrolls with the list. Previous list-blanking spinner replaced by a "Searching…" label so results stay visible during refetch. |
| "Hide my songs" | ✅ | Moved 2026-07-28 from a switch inside the filter sheet to a toolbar checkbox next to Sort/Filters, as on web. Shown only when signed in with a non-empty repertoire, and (like web) it no longer counts toward the Filters badge. |
| Already-in-repertoire state | ✅ | Added 2026-07-28: "✓ In your repertoire" pill + role control (ActionSheet vs web `<select>`), replacing the old static "Added" text — the role can now be changed from this screen, as on web. |
| Add-song lead gating | ✅ | |
| Submit a missing song | ✅ | 2026-07-28: collapsed "Can't find your song?" panel now sits at the foot of the search results (web keeps its form there), not only in the empty state. |
| YouTube/Spotify links on rows | ✅ | 2026-07-28: browse rows have them too — native's catalog fetch moved off a raw `songs` select onto the **`browse_songs` RPC web `/search` uses**, which derives the ids from the media URLs in SQL. Web embeds players inline; native opens the apps (intentional — a WebView per row would hurt scrolling). |
| Catalog data matches web | ✅ | Fixed 2026-07-28 by the same move. The old raw join read `song_composers` only, so it dropped lyricists (web: "My Favorite Things (O. Hammerstein II, R. Rodgers)", native: "(R. Rodgers)"), and used bare `year_written`, so recording-only years were missing. `browse_songs` unions composers+lyricists and takes `least(year_written, min(recording year))` — same rule as `my_repertoire`, which fixed this class of drift on Repertoire in #237. |
| Pagination | ⚠️ | Native still loads the whole catalog client-side — now 6 parallel `browse_songs` pages, measured ~310-560ms vs the old raw select's 582ms — where web pages incrementally. Fine at current catalog size; revisit for the offline-catalog track. |
| `song_popularity_counts` RPC | ✅ | No longer called: `browse_songs` returns `popularity`. `songs.tsx` was the **last caller anywhere in the repo**, so the RPC (migration 049) is now unreferenced and safe to drop in a future migration. |

### Sets
| Feature | Status | Notes |
|---|---|---|
| Sets list (owned/collab/public) | ✅ | Rebuilt 2026-07-29 onto **`GET /api/sets`** (bearer) — native had reimplemented the three queries client-side and already drifted (web selected `jam_id`, native didn't; the two dedupes differed). The owned/collaborating/public split + dedupe now live only in the route. `GET`/`POST /api/sets` gained bearer support via a new `resolveApiClient` helper, which returns the RLS-scoped client the user was resolved *from* — a cookie-only route handed a bearer request runs as `anon` and silently returns nothing. |
| Sets list: signed-out view | ✅ | Fixed 2026-07-29. Native showed a hard `SignInPrompt` wall; web serves public sets + a "Sign up →" panel to guests. Native now renders the same, so guest browsing works on this tab like the others. |
| Sets list: local cache | ✅ | Added 2026-07-29. Sets was the last list tab with no `lib/cache` stale-while-revalidate layer, so it flashed skeletons on every focus while Repertoire/Songs/Jams painted instantly. |
| Sets list: empty-repertoire nudge | ✅ | Added 2026-07-29 — web's "Your repertoire is empty → Browse songs" card (→ native `/songs`). |
| Sets list: Copy on collaborating sets | ✅ | Fixed 2026-07-29 — native only offered Copy on `public` sets; web offers it on collaborating ones too. |
| Sets list: owner attribution | ✅ | 2026-07-29: `GET /api/sets` now joins the owner profile for **collaborating** sets too, so both apps show "by Ada Lovelace @ada" instead of web's bare "COLLABORATOR" chip. Owner name taps through to the profile (`/u/[username]` on web, `/profile/[id]` on native) — native uses a nested `TouchableOpacity`, not `Text onPress`, so the tap wins the responder over the card. |
| Sets list: create affordance | ✅ | Rationalised 2026-07-29 to **one entry point per app**: a dashed "New set" card as the first row of "Your sets". Web had two (a near-invisible ghost `+` in the section header *and* the dashed card at the foot of the list); native had three (a filled amber `+` in the page header, the dashed card as `ListHeaderComponent` above every section heading, and a "Create a set" button in `ListEmptyComponent` — all three rendered at once on an empty account, because `sections` was seeded unconditionally with `Your Sets`). The card sits at the **top** because both apps order owned sets `created_at desc`, so that is where the set you just made appears; a footer button would have been spatially disconnected from its own result. It doubles as the empty state, so native's separate "No sets yet" block is gone. **Note:** the Jams tab solves this differently (ghost `+` in the section header, dashed card only when the hosting section is empty — mutually exclusive rather than deduplicated). Sets and Jams are now internally inconsistent; unify if it grates. |
| New set screen | ✅ | 2026-07-29: native `set/new.tsx` was the last native set mutation doing a **direct `sets` insert**; it now calls `POST /api/sets` (bearer), which is also the only path that honours `jamId` and its attendee→collaborator fan-out. Both apps keep name + optional description on a dedicated screen. |
| Set detail: songs, reorder, key, leaders | ✅ | `set/[id].tsx`. |
| Set detail: signed-out view | ✅ | Fixed 2026-07-29. `load()` opened with `if (!user) return`, so a guest tapping a public set from the list sat on the spinner forever — the tab let you browse to sets you then couldn't open. Guests now load them read-only (`isPublicViewer` already hides leader pills), as on web. |
| Set detail: visibility gate | ✅ | Added 2026-07-29 with the above, and **necessary for it**: RLS on `sets`/`set_songs` is `create policy … using (true)`, so the database hands any set — private included — to any caller, anonymous ones too (verified against prod with the anon key). Web enforces private/link access in `set/[id]/page.tsx`; native had **no gate at all**, so any signed-in user with a set id could already read a private set, and letting guests load would have widened that to anonymous. Native now mirrors web's gate. **Note native has no admin/song_editor exemption** (it never fetches the profile role), so an admin can't open a private set they don't collaborate on from the phone — admin is desktop-only by choice. |
| Leader/support display + public-viewer gate | ✅ | Native now renders per-song Lead/Support pills (explicit leaders + participant repertoire confidence), hidden from public viewers via `isPublicViewer = !isOwner && !isCollaborator`, editor-toggleable — mirrors web `SetSongRow`. Replaced the old self-only leader star. (native has no CSV/PDF export, so those web gates don't apply.) Derivation still inline; see core-extraction backlog. |
| Co-owner role | ✅ | Native recognizes `co-owner` (full owner powers except delete + assigning co-owners). All native set mutations now route through the web API via bearer (single-source authz), so co-owners aren't blocked by owner/editor-only RLS. Owner-only: delete + granting/changing co-owner. |
| Mark-as-played | ✅ | PR #187 / #240; `reorderSongsForPlayed` in core. Now via `PATCH /songs/[songId]` + reorder. |
| Realtime sync | ✅ | PR #240 (narrower than web by design). |
| Add song to set — shows songs already in set | ✅ | `existingIds` → "Added". Add now via `POST /songs`. |
| Spotify export | ✅ | Bearer route. |
| Collaborators / sharing | ✅ | Set-settings modal: owner + co-owners manage sharing, add/remove collaborators, and change roles (co-owner assignment is owner-only), all through the web API. Editors still can't invite from native (web allows it — minor follow-up). |

### Add-to-set (from repertoire) — `AddToSetModal`
| Feature | Status | Notes |
|---|---|---|
| Lists owned + collaborating sets | ✅ | Added 2026-07-20 (was owned-only). |
| Marks sets already containing the song | ✅ | Added 2026-07-20 — mirrors web `AddToSetPanel`. |
| "+ New set" inline create | ❌ | Web has it; native says "create from Sets tab". Low priority. |

### Jams
| Feature | Status | Notes |
|---|---|---|
| Jams list + card | ✅ | `JamCard`; time format aligned to web (device locale, TZ only when set). |
| Jams list: signed-out view | ✅ | Added 2026-07-29. Both apps let guests browse official/past events; web also closes with a "Join the session → Sign in" card and native had **no guest affordance at all**. Native now renders the same card in the list footer. |
| Jams list: empty state | ✅ | Fixed 2026-07-29. Native swapped the whole `SectionList` for a centred "No upcoming jams" block once every section was empty — which also removed the hosting section and with it the **only "Post a jam" entry point on the tab**, exactly on the empty account that needs it. (Same failure as the sets-list create affordance in #267.) The list now always renders; web's "No jams yet. Be the first to post one!" card is a footer, signed-in only, since a guest already gets the sign-in card. |
| RSVP / waitlist | ✅ | Web route via bearer (PR #238). |
| Invite respond / cancel / copy | ✅ | PR #238. |
| Jam detail | ✅ | |
| Location autocomplete | ⚠️ | Uses **deprecated** legacy Google Places endpoint (jam/new, jam/edit, ProfileForm) — migrate to Places New API. |
| JamCard time format i18n | ✅ | Fixed 2026-07-20. |

### Friends / Matches (`(tabs)/friends.tsx`)
| Feature | Status | Notes |
|---|---|---|
| Match list + search | ✅ | `match_jammers` / `search_users` RPCs. |
| Invite to jam | ✅ | |
| Signed-out view | ✅ | Fixed 2026-07-29 — was the generic `SignInPrompt` wall; now web's "Find jammers" heading + subtitle with a "See who you could jam with" card. The search box is dropped for guests (it needs a session), as on web. |
| Empty-repertoire state | ✅ | Fixed 2026-07-29 — the card was there but had **no way out of it**; web's amber "Browse songs →" CTA was missing. Now present (→ native `/songs`), and the copy matches web. |

### Sign up / Account creation (`apps/native/app/(auth)` ↔ web `/auth` + `/account` setup)
| Feature | Status | Notes |
|---|---|---|
| "Sign in" tab for guests | ✅ | 2026-07-29: the fifth tab reads "Sign in" for a guest, but tapping it opened a profile tab whose entire content was *another* sign-in button. It now intercepts `tabPress` and opens `/(auth)/sign-in` directly, like web's top-nav Sign in link; the tab you were on stays selected underneath. `(tabs)/profile.tsx` redirects there too, covering sign-out and deep links. |
| Welcome screen | ✅ | Native-only entry (logo, tagline, Get started / Sign in / Continue as Guest). Web opens straight to the form — intentional (app launch vs web page). |
| Email/password + confirm, Google, Apple, forgot-password | ✅ | Aligned. |
| Signup value-prop subcopy | ✅ | Added 2026-07-21 — native now shows web's "Discover new music…" copy in signin+signup. |
| Google button mark | ⚠️ | Native uses a monochrome Ionicon `logo-google`; web uses the multicolour Google "G". Minor cosmetic. |
| Post-signup profile setup | ✅ | Web `/account` (`AccountPanel`) ↔ native `/setup` (`ProfileForm`). |
| Profile photo during setup | ✅ | Added 2026-07-21 — native `ProfileForm` now has optional avatar upload (camera/library, 5 MB cap), matching web's setup panel. |
| Username auto-suggest from email | ✅ | Added 2026-07-21 — `suggestUsername` extracted to `packages/core/username`, used by both. |
| Username uniqueness check | ✅ | Native switched `.eq`→`.ilike` (case-insensitive) 2026-07-21 to match web and prevent case-variant collisions. |
| Email change / delete / sign out in setup | 🚫 | Web bundles these into the same panel; native keeps them in the profile tab / account modal — intentional split. |
| Instruments / genres pickers | ✅ | Rebuilt inline 2026-07-21 to match web: "You play"/"Your genres" cards, featured chips + inline search, `genres_by_usage` featured ordering (falls back to full list). Existing-instrument level uses an iOS ActionSheet (web uses a `<select>`); add-step uses inline level buttons like web. Replaced the old full-screen modal pickers. |

### Profile / Account
| Feature | Status | Notes |
|---|---|---|
| Profile view/edit | ✅ | `ProfileForm`. |
| Save → ActiveCampaign sync | ✅ | PR #239 (bearer). |
| Username rules | ✅ | `packages/core/username`. |
| Avatar upload + 5 MB cap | ✅ | Cap added 2026-07-20. |
| Account settings / email change | ✅ | |
| Report a bug | ✅ | Native `/feedback` (bearer) — PR #243. |
| Admin link | 🚫 | Desktop-only by choice. |

### Other
| Screen | Status | Notes |
|---|---|---|
| Notifications | ✅ | Push notifications shipped (PR #235). |
| Song detail (`song/[id]`) | ⚠️ | Works; 4 pre-existing `tsc` null-guard warnings (baseline). |
| Public profile (`/u/[username]`) | ❓ | Native has `profile/[id]`; verify nothing deep-links to `/u/`. |
| Tablet/iPad layout | ✅ | `ContentContainer` max-width (PR #242). Visual verify pending iPad build. |
| PDF / song-editor / admin / about-privacy-terms | 🚫 | Desktop-only / open-in-browser. |
| Inside SingJam blog (`blog/index`, `blog/[slug]` ↔ web `/blog`, `/blog/[slug]`, inside.singjam.org) | ⚠️ | Added 2026-11-11. Both apps read `blog_posts` (migration 232) and draw Markdown parsed by core `parseBlogMarkdown`. Native entry is a row on Profile, so guests can't reach it yet (web: footer link, open to all). Authoring is web-only at `/admin/blog`. Not yet verified on a device build. |

## Core-extraction backlog (structural anti-drift)
Move these rules into `packages/core` (with unit tests) so web + native share one implementation.
Each is **web-affecting** (core rebuilds web) → batch them.
- [x] Song filter matching + **cascading option derivation** — in core as `songMatchesFilters` /
      `deriveFilterOptions` / `countActiveFilters`. The native *sheet* that renders them is now a
      single `components/SongFilterSheet.tsx` shared by `songs.tsx` and `(tabs)/index.tsx`
      (2026-07-28), mirroring web's shared `FilterPanel`; it had been hand-copied into both and
      had drifted (sheet title, year placeholders, missing empty state). Web `useSongFilters`
      still wraps core separately — fine, it's React state plumbing, not rules.
- [ ] Lead-gating / confidence rules (`canLead = singing_voice && !== 'none'`) — duplicated in
      `SuggestionCard`, `RepertoireCard`, `songs.tsx`, web `ConfidencePicker`.
- [ ] Sort comparators (title asc/desc, popularity+title tiebreak).
- [ ] Search field-set / normalization used by add-song rows.
- [ ] Set leader/support participant derivation (who leads/supports a song from explicit
      `leader_user_ids` + participant repertoire confidence, hidden from public viewers).
      Currently inline in web `SetSongRow` and native `set/[id].tsx`; extract to core with tests.

Already shared in core: `formatComposers`, `mergeSuggestionsById`, `reorderSongsForPlayed`,
`formatJamTime`, `username` rules, `singingVoice`, `sortRepertoireSearchResults`.

## Known gaps / deferred (not yet scheduled)
- **Set *detail* gaps found in the 2026-07-29 sets pass (list view was fixed, detail was not):**
  - Jam → set list create/link/unlink is **missing entirely** on native. Web's `JamSetList`
    offers "Create set list" (auto-named `{jam} – set list`, passes `jamId` so attendees become
    accepted collaborators), "Link existing" and "Unlink"; native's jam detail only lists already
    linked sets read-only. This is the highest-value create path and it is phone-inaccessible.
  - `AddToSetModal` still inserts `set_songs` rows directly (computes `position` itself, one
    insert per song) instead of `POST /api/sets/[id]/songs`, so it never sets
    `added_by_user_id` and skips the confidence upsert — songs added to a set from native
    have no attribution recorded.
  - No rename / description editing on native at all; web's inline "Edit set name" saves both.
  - Private + link-shared **flows** still absent on native (web has `SetRequestAccess` and
    `SetJoinPrompt`). Since 2026-07-29 native at least *explains* the block — "This set is private"
    / "Sign in to open this set" — instead of dead-ending at "Set not found", but there is still no
    way to request access, and no auto-join for `link` sets (web adds a signed-in visitor as a
    viewer server-side on first visit; native just shows the set without recording them).
  - Native lacks: add-to-repertoire from a set row, YouTube playlist export, Ultimate Guitar
    playlist URL, per-song media add. (CSV/PDF stay desktop-only by choice.)
- **Native never reads the `jam_invites` feature flag.** Web gates the "Jams you're hosting"
  section (and so "Post a jam") on `invitesEnabled || isAdmin`, and disables the invite buttons on
  `/friends` and profiles when the flag is off; native shows all of it unconditionally. Harmless
  while the flag is on, but flipping it off would not take effect on the phone. Found during the
  2026-07-29 guest/empty-state pass; not fixed there to keep that PR to guest + empty states.
- Add-to-set "+ New set" inline create (native).
- Google Places New API migration (L3).
- Search pagination on native (superseded by the offline-catalog track — see `project_offline_catalog` memory).
- Filter option **cascading/year logic** is currently inline per native screen (native has no
  component test harness); extract to core to get tests — see backlog above.
