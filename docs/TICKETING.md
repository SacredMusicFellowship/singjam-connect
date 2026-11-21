# Paid Ticketing — External APIs & Variables

Groundwork inventory. No implementation yet. Written 2026-08-05.

## 1. Where this plugs into what already exists

Paid ticketing is not greenfield — the seam is already cut. `jams.visibility` is
one of `private | community | official` (migration 055), and `official` events
already carry a `tickets_url` that points at an external ticketing provider.

| Existing thing | File / migration | What ticketing does to it |
|---|---|---|
| `jams.tickets_url` | 054_public_jams.sql | Becomes optional — internal ticketing replaces it for org events, external stays supported |
| RSVP hard-block on official events | `apps/web/app/api/jam/[id]/rsvp/route.ts:29` | Official events currently return `400 "Official events use external ticketing"`. Paid tickets need a real path here |
| `capacity` + waitlist promotion | 058_jam_rsvps.sql, rsvp route | Paid inventory must be **held** during checkout or capacity oversells between session start and webhook |
| `email_outbox` | 149_email_outbox.sql | Reusable for durable ticket-confirmation delivery — **but see gotcha below** |
| `feature_flags` | 067_feature_flags.sql | Gate the rollout behind a `paid_ticketing` flag |
| `qrcode` dependency | already in `apps/web/package.json` | Ticket QR codes / door check-in, no new dep needed |
| Netlify scheduled functions | `apps/web/netlify/functions/` | Existing pattern for a reconciliation sweeper (4 functions already there) |

### Two gotchas found while surveying

1. **`email_outbox` cannot carry ticket emails as-is.** Its uniqueness guarantee
   is `unique (user_id, type)` — at most one email of a given type per user
   *ever*. A user buying tickets to two events would get one email. Ticket
   emails need a per-order key (e.g. `unique (user_id, type, order_id)`) or a
   separate outbox path.
2. **`NEXT_PUBLIC_SITE_URL` is referenced in 18 places but is absent from
   `apps/web/.env.local`.** Every call site has a `?? "https://singjam.org"`
   fallback so nothing is broken today, but Stripe Checkout `success_url` /
   `cancel_url` are built from this, and locally it would silently send test
   redirects to production. Set it in local env before wiring Checkout.

## 2. Stripe surface area

Current Stripe API version at time of writing: **`2026-07-29.dahlia`**
(named major releases; monthly releases are backward-compatible). `stripe-node`
v12+ pins the API version to the SDK release, so the pin comes from the package
version — do not hand-set `apiVersion` unless deliberately overriding, and match
the webhook endpoint's version to it.

### Packages

| Package | Needed? | Notes |
|---|---|---|
| `stripe` (server SDK) | **Yes** | Server-only. PaymentIntents, webhook signature verification, refunds |
| `@stripe/stripe-js` + `@stripe/react-stripe-js` | **Yes** | **Approved by Ben 2026-08-05** for the embedded Payment Element, satisfying CLAUDE.md's third-party UI library gate |
| `@stripe/stripe-react-native` | Undecided | Only if native pays in-app rather than opening the web purchase page. Defer |
| Stripe CLI (dev tool, not a dep) | **Yes** | `stripe listen --forward-to localhost:3000/api/stripe/webhook` for local webhook testing |

### Decided: embedded Payment Element, backed by Checkout Sessions

Payment fields render inside singjam.org via Stripe-hosted iframes, so the form
is on-brand while card data never touches our servers.

**Correction 1 — PCI scope.** Elements does *not* widen PCI scope relative to
hosted Checkout. Stripe Elements is SAQ A eligible, the same tier as Checkout,
because the fields live in Stripe-owned iframes; Stripe auto-generates the SAQ A
paperwork in the Dashboard. The real trade-off of Elements is more client code and
a separate native decision, not compliance burden.

**Correction 2 — do NOT use a raw PaymentIntent.** An earlier draft of this doc
said Elements implies driving a PaymentIntent ourselves. Stripe's official
guidance is the opposite: *"When using the Payment Element, back it with the
Checkout Sessions API (via `ui_mode: 'custom'`) over a raw PaymentIntent where
possible."* Their integration routing table lists "custom payment form with
embedded UI" → **Checkout Sessions + Payment Element**.

This matters beyond style. A raw PaymentIntent gives up what Checkout Sessions
handle for free — discounts, adaptive pricing, and critically `automatic_tax`,
which has no field on a PaymentIntent at all. The PaymentIntent tax path requires
manually creating a Tax calculation, setting `amount` to its total, linking it,
*and* recording a tax transaction after payment or the sale never appears in tax
reports. Checkout Sessions make that one boolean.

So: `checkout.sessions.create({ ui_mode: 'elements', mode: 'payment', … })`, and
the webhook events stay session-based (see §2). §5's unique key can be either the
session id or the resulting payment intent id — prefer
`stripe_checkout_session_id` as the idempotency key since it exists first.

**Correction 3 — the param value is `elements`, not `custom`.** The plugin's
best-practices skill says `ui_mode: 'custom'`. That string is wrong: the API enum
is `elements | embedded_page | hosted_page`, verified against
`stripe docs api POST /v1/checkout/sessions`. Sending `custom` fails outright.
"Custom checkout" is the old marketing name and survives only in the Stripe.js
namespace (`js/custom_checkout/*`) and in stale doc prose. The skill is right
about the *substance* (back the Element with a Checkout Session) and stale on the
literal value — worth remembering that the skills are guidance, not API reference.

**`expires_at` has a 30-minute minimum.** Anywhere from 30 minutes to 24 hours
after creation; a 15-minute window is rejected. This forces a design constraint
that is easy to get backwards:

> The database hold must **outlive** the Stripe session, never match it.

Stripe refuses payment on an expired session, so letting the session die first
guarantees every successful payment arrives while the order is still `pending` —
the state the webhook's guarded update needs. If the hold were the shorter of the
two, a payment at minute 29 could land after the sweeper released and resold that
stock: money taken, no ticket, and the webhook's `.eq("status", "pending")`
silently matching nothing. Implemented as session 30 min / hold 35 min.

### APIs / features

- **Checkout Sessions** with `ui_mode: 'custom'` — created server-side per ticket
  order; the Payment Element confirms it client-side. Core API.
- **Webhooks** — the source of truth for fulfilment. Never fulfil from the
  browser's success callback; the user can close the tab. Minimum event set:
  `checkout.session.completed`, `checkout.session.expired`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`, `charge.refunded`,
  `charge.dispute.created`.

### Hard rules from Stripe's official guidance

These are "traps to avoid" in Stripe's own words, not preferences:

- **Never pass `payment_method_types`.** Omitting it enables dynamic payment
  methods, where Stripe picks and ranks methods per customer from 100+ signals and
  they become Dashboard-configurable with no code change. Hardcoding
  `['card']` — the intuitive thing to write — actively suppresses conversion. To
  restrict methods, use `payment_method_configurations` or
  `excluded_payment_method_types` instead.
- **Instantiate a `StripeClient`**; the global `stripe.apiKey = …` pattern is
  deprecated in all current SDKs.
- **Pass `integration_identifier`** to `checkout.sessions.create` (available on
  API `2026-03-25.dahlia`+) to tag and compare checkout flows in the Dashboard.
  Stripe asks for an 8-random-letter suffix on the label.
- **Never use the Charges API, Sources API, Tokens API, or the legacy Card
  Element.** All superseded; Card Element → Payment Element.
- Target **API `2026-07-29.dahlia`**, **`stripe` Node SDK 22.4.0**.
- **Refunds** — cancelled events, host-issued refunds.
- **Radar** — fraud screening, included on standard pricing, no extra wiring.
- **Stripe Tax** — *decision needed.* Whether event admission is taxable varies
  by state/venue. Not needed for v1 if events are donation-style or the org
  absorbs it.
- **Payment Links** — no-code fallback. Worth knowing as a stopgap for a single
  event before the real integration ships.
- **Stripe Connect** — **only if hosts receive money directly.** See §4.
- **Customer Portal / Billing / Subscriptions** — not needed. One-off purchases.

## 3. Environment variables to add

Names only — values go in `.env.local` (gitignored) and Netlify env, never in git.
**The repo is public.**

### `apps/web/.env.local` + Netlify

| Var | Scope | Purpose |
|---|---|---|
| `STRIPE_RESTRICTED_KEY` | server, secret | API calls. **Use a restricted key (`rk_`), not a secret key (`sk_`)** — see below |
| `STRIPE_WEBHOOK_SECRET` | server, secret | Signature verification. **Distinct per endpoint** — the Stripe CLI's local secret differs from the deployed one |
| `NEXT_PUBLIC_SITE_URL` | public | Already used in 18 places, currently unset locally. Checkout redirect URLs |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public | **Required** — Stripe.js / Payment Element. `pk_test_…` / `pk_live_…` |
| ~~`STRIPE_CONNECT_CLIENT_ID`~~ | — | Not needed. Single-account model chosen (§4) |

### `apps/native/.env.local`

| Var | Purpose |
|---|---|
| `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` | **Only if** paying in-app via `@stripe/stripe-react-native`. Not needed if native opens the web Checkout URL |

Native already has `EXPO_PUBLIC_WEB_URL`, which is all the browser-handoff
approach requires.

### Key handling — this repo is PUBLIC

Stripe's stated default is a **restricted API key (`rk_`) over a secret key
(`sk_`)**, scoped to only the permissions this integration needs, with a separate
key per environment. A compromised `rk_` can do far less than a compromised `sk_`.
Their words: key exposure in source repositories is the *leading cause* of API key
takeovers.

That lands hard here — singjam-connect is a public repo and has already leaked env
values once through a backup file that `.gitignore` didn't match. Verified state
today:

- `.gitignore` **does** cover `.env*.local` for both apps (confirmed via
  `git check-ignore`), and GitHub secret scanning + push protection are on.
- There is **no pre-commit hook**. Stripe explicitly recommends one to catch
  `sk_…` / `rk_…` before they can be committed. Given the prior leak, this should
  land *before* any key exists locally, not after.

Also from Stripe's security guidance, worth adopting:

- Configure an **access policy / IP restriction** per key, different per
  environment.
- **Allowlist Stripe's IP addresses** on the webhook endpoint as defense in depth,
  on top of signature verification (never instead of it).
- **Add a Content-Security-Policy.** §4a notes the site currently has none. That
  was framed there as "nothing to add" — wrong framing: Stripe says a missing CSP
  weakens the XSS protections Stripe.js relies on. Needed directives for
  Stripe.js: `script-src` and `frame-src` `https://*.js.stripe.com
  https://js.stripe.com`, `connect-src https://api.stripe.com`, plus
  `frame-src https://hooks.stripe.com` for 3DS redirects, and the `*.link.com`
  directives if Link is enabled.
- Never log keys or include them in error messages; never build an endpoint that
  dumps env vars.

**Native / App Store note to verify:** Apple's IAP rules generally exempt goods
and services consumed outside the app — real-world event tickets fall in that
category, so external payment should be permitted. This needs confirming against
current App Review guidelines before the native purchase flow ships, because
getting it wrong is a rejection.

## 4. Money flow — DECIDED: single account

**(A) Single account — all funds to Sacred Music Fellowship.** Chosen by Ben
2026-08-05. Only `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`. No Connect, no
per-host KYC onboarding, no payout reconciliation. Matches the existing
`official` = org-run event model.

Rejected for now: **(B) Stripe Connect**, where individual hosts get paid
directly. Would add connected-account onboarding, per-host KYC/verification
state, destination charges with `application_fee_amount`, payout reconciliation,
and `STRIPE_CONNECT_CLIENT_ID` — plus roughly 0.25% + $0.25 per payout on Express
accounts, on top of normal processing. Connect can be layered on later without
redoing the ticket schema, so this is not a one-way door.

## 4a. Two HTTP header findings

From `apps/web/next.config.js:22`. There is no Content-Security-Policy on the
site today — which per Stripe's security guidance is itself a gap to close, not a
convenience (see §3). Separately, the existing `Permissions-Policy` header
matters:

```
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

1. **`camera=()` blocks QR ticket scanning.** Camera is disabled site-wide on
   every path. A door check-in screen that scans ticket QR codes on the web will
   fail silently until this is relaxed for that route only. Not a blocker for
   selling, but it blocks the redemption half of ticketing.
2. **Apple Pay / Google Pay in the Payment Element needs a real device test.**
   `payment` is not listed in the header, so the browser default (`self`) applies
   and Stripe's cross-origin iframe relies on its own `allow="payment"` attribute.
   This should work as-is, but wallet buttons are the most common thing to
   silently not render — verify on a real iOS device before launch rather than
   assuming.

`X-Frame-Options: DENY` is not a problem — it governs singjam.org being framed by
others, not Stripe iframes being embedded in our pages.

## 4b-0. Build state (2026-08-06)

Shipped on `feat/ticketing-groundwork`, all uncommitted:

| Piece | State |
|---|---|
| `supabase/migrations/152_paid_ticketing.sql` | **Written and applied to remote.** Tiered `ticket_types`, `ticket_orders`, `tickets`, plus `reserve_ticket_order` / `ticket_type_sold_count` / `expire_stale_ticket_orders` |
| Oversell guard | **Verified under real concurrency** — 6 simultaneous reservations against 2 seats yielded exactly 2 successes, 4 rejections, 2 ticket rows. Holds release on expiry; sweeper marked 2 |
| `apps/web/lib/stripe.ts` | Written. `StripeClient` instance, no `apiVersion` override |
| `apps/web/app/api/jam/[id]/tickets/checkout/route.ts` | Written. Reserves stock *before* creating the session |
| `apps/web/app/api/stripe/webhook/route.ts` | Written. Raw-body signature verify, idempotent guarded transitions, mirrors paid orders into `jam_rsvps` |
| Tests | 20 new, all passing; full suite 42 files / 318 tests green |
| `npm i stripe @stripe/stripe-js @stripe/react-stripe-js` | **NOT RUN** — an `expo start` loop has been live since 29 Jul and installs in this tree previously broke nativewind and reverted the test phone |
| Payment Element UI + `/jam/[id]/tickets/complete` page | Not built yet |

Note the tests pass *without* the `stripe` package installed, because they mock
`@/lib/stripe` and the webhook's only direct import is `import type`. `npm run
build` will fail until the install happens.

Invoicing was descoped by Ben on 2026-08-06 ("I don't know if we need to use
stripe for invoices, let's just focus on the ticketing for now"). §4b below is
retained as a starting point if it comes back.

## 4b. Invoicing — descoped, kept for reference

Ben named **Invoicing** alongside Payments on 2026-08-05. Nothing in the codebase
implies an invoicing use case, so what it's *for* is genuinely undefined — and the
answer changes the build substantially. Plausible readings:

| If invoicing is for… | What it actually is in Stripe |
|---|---|
| Workshop / lesson fees billed after the fact | Invoicing API, one-off invoices per customer |
| Recurring memberships or supporter tiers | **Billing/Subscriptions**, not Invoicing — plus the Customer Portal for self-service changes |
| Venue hire, artist fees, B2B billing | Invoicing API with tax IDs and reverse-charge handling |
| Donations / pledges | Usually neither — a Payment Link or Checkout in `mode: 'payment'` |

Notes that apply once it's pinned down:

- Invoicing is a higher-level product, so it's an allowed integration surface
  (Stripe's rule is: only Checkout Sessions, PaymentIntents, SetupIntents, or
  higher-level products like Invoicing / Payment Links / subscriptions).
- For invoices, `automatic_tax: { enabled: true }` requires the **Customer to have
  a saved address** — unlike Checkout, an invoice won't collect one for you.
- If this turns out to be recurring revenue, do **not** build renewal loops on raw
  PaymentIntents; use the Billing APIs, which handle renewal, retries, and dunning.
  Model one Stripe **Product per tier** (not one product with many prices), or
  every invoice line item renders with the same name and supporters can't tell
  tiers apart. Multiple prices on one product are only for variants of the *same*
  tier, e.g. monthly vs annual.

## 4c. Tax — the trap that silently collects nothing

Flagged because it is the single most common Stripe Tax mistake and it fails
*silently*:

> Enabling `automatic_tax` without an active registration returns no error and
> collects no tax. You believe tax is on; you are collecting nothing.

An "active registration" is a per-jurisdiction record showing as *Collecting* — it
is not the same as having a Stripe account. So for ticket sales:

1. Confirm with the org's tax advisor whether event admission is taxable in the
   states/venues being used. **This doc does not answer that** — it's a legal
   determination, and Stripe's own guidance is explicit that an agent should guide,
   never advise, on where you're obligated to register.
2. Record each registration in Stripe **after** registering with the tax authority.
   Adding it in Stripe does not register you with anyone.
3. Set a **product tax code** on the Product from Stripe's canonical list via the
   Tax Codes API. Never invent or hardcode a `txcd_` value. Event admission has
   specific codes — do not fall back to the generic
   `txcd_10000000` (electronically supplied services), which is wrong for this and
   too broad for US state-level taxability.
4. If a ticket shows zero tax later, `taxability_reason: not_collecting` is
   **ambiguous** — it means either no active registration *or* a Nontaxable tax
   code (`txcd_00000000`) on the product. Rule out the tax code before concluding
   it's a registration gap. On a Checkout Session the breakdown isn't returned by
   default; retrieve with `expand[]=line_items.data.taxes`.

## 5. New database tables (sketch — not final)

All need explicit grants per CLAUDE.md, and a numbered migration (next is `152_`).

- `ticket_types` — `jam_id`, `name`, `price_cents`, `currency`, `quantity`,
  `sales_start_at`, `sales_end_at`
- `ticket_orders` — `stripe_payment_intent_id` (unique — the idempotency key that
  makes webhook redelivery safe), `buyer_user_id`, `status`, `amount_cents`
- `tickets` — `order_id`, `ticket_type_id`, `holder_name`, `qr_token` (unique),
  `checked_in_at`

Inventory holding matters: a `pending` order must count against `quantity` with
a short expiry, or two buyers can both pass the capacity check and both pay.

## 6. Tooling state (as of 2026-08-05)

| Thing | State |
|---|---|
| `stripe@claude-plugins-official` plugin | **Installed**, v0.4.6 (user scope). 8 skills + bundled MCP server |
| `claude-plugins-official` marketplace | **Added** (was not configured; `anthropics/claude-plugins-official`) |
| Stripe CLI | **Installed**, v1.45.1 via `npm i -g @stripe/cli` (global — does not touch repo `node_modules`) |
| Stripe MCP server (`https://mcp.stripe.com`) | **Registered but unauthenticated.** `claude mcp list` → "Needs authentication" |
| Stripe CLI auth | **Not authenticated** (`stripe whoami` → `authenticated: false`) |
| `stripe_implementation_planner` | **Unavailable** — MCP-only, blocked on the above |
| `stripe` npm package in `apps/web` | Not yet added |

Both blockers are interactive OAuth, which a non-interactive session can't perform.
To unblock, in an interactive session: `/mcp` and authenticate the `stripe` server,
and run `stripe login` for the CLI. Plugin skills also need a session reload to
register with the Skill tool — their content was read directly from
`~/.claude/plugins/cache/claude-plugins-official/stripe/0.4.6/` in the meantime,
which is where the guidance in §2–§4c comes from.

## 7. Accounts / credentials to gather

Action items for Ben — none of this is discoverable from the codebase:

- [ ] Stripe account login email → add a row to `ACCOUNTS.md` (currently absent)
- [ ] Authenticate the Stripe MCP server + CLI (see §6), then re-run
      `stripe_implementation_planner` to cross-check this plan
- [ ] Define what Invoicing is for (§4b)
- [ ] Confirm the Stripe account's legal entity — Sacred Music Fellowship?
- [ ] Confirm a bank account is connected and payouts are enabled
- [ ] Test-mode and live-mode secret keys
- [x] ~~Check whether the org qualifies for Stripe's nonprofit processing
      discount~~ — **it does not.** Settled 2026-09-08 against Stripe's own
      support page: eligibility needs "at least 80% of your Stripe payment
      volume from tax-deductible donations", and ticket sales are named as a
      category that does not count toward that threshold. Standard 2.9% + 30c
      applies.
- [ ] Decide whether ticket sales are taxable in the venues being used
- [ ] Decide the native purchase flow: `@stripe/stripe-react-native` in-app vs
      opening the web purchase page in a browser
- [x] ~~Decide (A) vs (B) in §4~~ — (A) single account, 2026-08-05
- [x] ~~Approve the Stripe UI dependency~~ — approved, 2026-08-05

## PayPal — not available on this account (checked 2026-09-07)

Stripe's own PayPal payment method is limited to **European business locations**
(AT BE BG CH CY CZ DE DK EE ES FI FR GB GR HR IE IT LI LT LU LV MT NL NO PL PT RO
SE SI SK). This account is `country: US`, `default_currency: usd`,
`business_type: non_profit` — so it does not qualify, and no Dashboard toggle
changes that.

The documented US route is the **PayPal custom payment method**: a gated preview
that needs an access request, a Stripe-supplied adapter hosted in our own
environment, our own PayPal business account, and **Stripe fees on top of
PayPal's own**. For $8–50 community tickets that is a poor trade — a second
integration and a second set of fees to reach people who almost all also have a
card or a wallet.

Bolting a standalone PayPal button on outside Stripe would also mean a second
fulfilment path: our tickets, holds, refunds and check-in all hang off the Stripe
webhook, so PayPal orders would need their own version of each. Not recommended.

**The real conversion gap is domain registration.** Elements requires a
registered payment method domain for Apple Pay, Google Pay, Link and Amazon Pay,
and `payment_method_domains` on this account is empty — so three of the four
methods the session offers likely never render. Registering singjam.org is one
Dashboard action and reaches far more people than PayPal would.

### Klarna and a bank option still appear in the Element (open, 2026-09-07)

Reported twice by Ben. The session is provably clean — one created by the real
checkout route comes back `card, link, cashapp, amazon_pay` — so
`excluded_payment_method_types` is doing its job at the session level. The
Payment Element renders Klarna and a bank option anyway.

The likeliest cause: the account's **default** payment method configuration has
`klarna` and `affirm` switched on, and the Element renders from the
configuration rather than from the session's narrowed list. Exclusion subtracts
from the session after the fact; it doesn't change what the configuration
advertises.

**Unresolved:** whether this is cosmetic or a real bypass. If a buyer selects
Klarna and pays, does Stripe reject it because the session excludes the type, or
does it go through? That single test settles it, and it needs a browser.

**The fix either way** is a purpose-built payment method configuration listing
only card, link, cashapp, amazon_pay, apple_pay and google_pay, referenced by the
session via `STRIPE_TICKET_PM_CONFIG`; unset, the route falls back to today's
exclusions.

Ben created the **live-mode** configuration 2026-09-07:
`pmc_1UDAnBL0Q3ZMbggU8t7ijh1h`. It belongs in the **Netlify** environment, not in
`apps/web/.env.local`, which holds test keys.

**A pmc id belongs to exactly one Stripe mode.** Using the live id with a test
key fails the session outright — verified: `resource_missing`, no session, no
sale. Because that would take down ticket sales rather than merely widening the
method list, the route now catches exactly that error, retries without the
configuration, and logs loudly. Losing the narrowed list beats losing checkout.

Local testing still shows the wide list until a **test-mode** "Tickets"
configuration exists; its id would be different again. The restricted key cannot
create one (`payment_method_configurations_write` not granted), so that is a
Dashboard job in test mode.

BNPL stays enabled account-wide on purpose: the org may want it elsewhere, just
not on a $15 ticket.

### Venmo — not offered by Stripe at all (checked 2026-09-07)

Venmo is absent from the 43 payment methods in the account's payment method
configuration. It is PayPal-owned and sold through PayPal's own Braintree stack,
so unlike PayPal this isn't a regional restriction that could lift — Stripe
doesn't carry it.

**Cash App Pay is the working equivalent** and is already enabled and resolving in
USD sessions: same pay-from-your-phone behavior, same audience. Between card,
Apple Pay, Google Pay, Cash App Pay and Link, a US community audience is covered.

### Payment method domains — done in test, live is a Dashboard step

Elements requires a registered payment method domain before Apple Pay, Google
Pay, Link or Amazon Pay will render. Nothing was registered, which is why
checkout showed a lone "Card" row.

Registered **test mode** 2026-09-07 via the API (`rk_test` can only reach test
mode), both returning apple_pay / google_pay / link / amazon_pay `active`:

| domain | id | livemode |
|---|---|---|
| singjam.org | pmd_1UD9PeL0Q3ZMbggUl4xxLoMo | false |
| www.singjam.org | pmd_1UD9PeL0Q3ZMbggUWVOBPYcZ | false |

**Live mode still needs doing** at dashboard.stripe.com/settings/payment_method_domains
— it needs a live key, which is deliberately not in `.env.local`.

**Live mode registered 2026-09-07** by Ben in the Dashboard: `singjam.org`
(pmd_1UD9pJL0Q3ZMbggUnqNnxuPS) and `www.singjam.org`
(pmd_1UD9paL0Q3ZMbggUzakAUByA), both Enabled.

**No Apple Pay association file is needed.**
`/.well-known/apple-developer-merchantid-domain-association` 404s on production
and Apple Pay is still Enabled with **Requires action: 0**. The modern
payment-method-domains flow verifies without the hosted file that the older
Apple Pay registration wanted — the docs ask only that the domain be registered.
Don't add a `public/.well-known/` file chasing this; it isn't the problem.

**Wallets will not appear on `localhost` no matter what.** Domain registration
can't cover it, so local checkout keeps showing only Card. That is expected, not
a regression — judge the wallet row on a deploy preview or production.

**13 methods are enabled on the account, but a USD session resolves to 4.**
Probe output was `card, link, cashapp, amazon_pay`; MB WAY (Portugal) and
Satispay (Italy) are enabled but never surface for US buyers in USD. Inert, not
worth a change, but don't be surprised by the gap between the Dashboard count and
what the Element shows.

---

# What's left (as of 2026-09-08, post-launch)

Paid ticketing is **live on production with real money**. Verified end to end that
night: live purchase → webhook → order paid → ticket issued → confirmation email →
buyer seated as attending with set-list access → refund → RSVP cancelled → an
abandoned checkout expiring and releasing its hold. All six webhook events have
now fired for real.

What follows is what is genuinely not finished, after the alarm below.

## Closed since launch

**The silent-fulfilment alarm is built** (`apps/web/lib/ticketSweep.ts`, wired
into the existing ten-minute `flush-email-outbox` schedule). Migration 154's
partial index on `(status = 'paid' and ticket_email_sent_at is null)` finally has
a reader:

- It **retries first** — a transient Resend outage is the likeliest cause of an
  unstamped order, and a retry fixes it outright with nobody woken up.
- What it cannot deliver, it **emails to `events@singjam.org`**: event, buyer
  address, amount, order id, the actual error, and a link to that event's guest
  list so the ticket can be sent by hand.
- It alerts **once per situation, not once per sweep** — dedupe lives in
  `system_flags` under `ticket_delivery_failed_notified`, keyed on the order ids
  the last alert named, so a repeat is suppressed for six hours but an order the
  alert has never mentioned always sends immediately. Same pattern as the Spotify
  token alert.
- `sendTicketEmail` now **returns whether it sent**, and fulfilment only stamps
  the order when it did. Previously an order with no resolvable address was
  stamped as delivered and vanished from the queue — the one failure the detector
  could not have caught.
- The same schedule now calls **`expire_stale_ticket_orders()`**, which nothing
  had ever called. Production was still holding a `pending` order from 9 August
  whose expiry webhook never landed; the sweep released it.

**Attendance reconciliation, the other half of the same problem** (migration 161,
`ticket_orders_awaiting_attendance()`). `fulfilPendingOrder` flips the order to
paid and only *then* seats the buyer, so the `.eq("status","pending")` guard that
makes Stripe's redeliveries safe gave everything after it exactly one attempt —
and `markAttending` never checks the errors on its own writes, so a failed insert
neither threw nor left a trace. Money taken, ticket delivered, buyer absent from
"Who's going" and with no seat on the set list.

- The queue is **derived**, since attendance has no per-order marker the way the
  email has `ticket_email_sent_at`: a paid member order with no `jam_rsvps` row.
- Keyed on **the absence of the row, not its status**. Cancelling sets
  `status='cancelled'` and leaves the row, and the cancel handler has no
  official-event guard — so a ticket holder can drop out on purpose, and keying
  on status would re-seat them every ten minutes against their wishes.
- The sweep **verifies the seat afterwards** rather than trusting `markAttending`
  to have written anything, or a permanently failing insert would be reported as
  repaired on every run forever.
- `markAttending` is now wrapped in the webhook path. That was only safe once
  repair existed — earlier note in this doc said the fix was "both, or neither",
  which was wrong: **reconciling alone is fine, catching alone is not.** A 500 on
  a completed sale bought nothing anyway, because the retry hit the status guard
  and returned early.

## 1. Managing an official event grants nothing on its set list

`canManageJam` (lib/jamAuthz.ts) governs the jam. Set access is a separate system:
owner-or-accepted-collaborator, which takes no notice of it. So Sherri can run an
event Ben created — tiers, sales, door check-in — but cannot touch its set list.
That is precisely the "second pair of hands" case the authz work was meant to fix,
and it stopped at the jam boundary.

**Not a one-liner.** The owner-or-collaborator test is re-implemented across ~17
files (the set page, the PDF page, and every mutation route: songs, reorder,
delete, collaborators, invites, copy, playlists), several with 2–3 checks each.
Fixing only the page would be worse than nothing — edit controls that 403 on click.
It wants a shared `canEditSet()` folding in `canManageJam` for a jam-linked set,
threaded through all of them, same shape as the `canManageJam` refactor itself.

Open design question inside it: should managing a jam grant **editor** or
**co-owner** on its set? Co-owner can remove other people's songs. For a host
fixing the running order before doors, probably yes — but that is a decision.

Workaround meanwhile: add the person as a set collaborator, one click.

## 2. A refund does not revoke set access — NOT a bug

Confirmed by reading the code: cancelling an RSVP on an ordinary jam does not
remove `set_collaborators` either — it only deletes the co-host row. Refunds
behaving the same way is *consistent*. Making refunds stricter than RSVP
cancellation would be the odd choice.

There is also a decent argument for leaving it: somebody who added songs to a set
should probably not lose access to their own contributions because they dropped
out. Listed here so it is not "fixed" by reflex. It is a product decision, and it
belongs to both paths or neither.

## 3. Mobile polish

Not yet looked at. The whole ticketing surface was built and reviewed on desktop:
the tier picker and its +/- steppers, the guest name/email step, the promo code
row, the Payment Element accordion, the confirmation page and its two CTAs, and
the host manage page — which is the most suspect, since it is a dense table of
sales, search and check-in buttons that a host will realistically use **on a phone
at the door**. Check the check-in flow one-handed before an event depends on it.

## Ben's Dashboard tasks (no code)

*(The 501(c)(3) rate used to be top of this list. It is not available to us —
the discount requires 80% of account volume to be tax-deductible donations, and
Stripe names ticket sales as excluded. Being a nonprofit was never the
qualifying condition; the revenue mix was.)*

- **Turn on developer/API email alerts** at Settings → Communication preferences,
  so a failing endpoint reaches a human. Coarse — it fires on sustained failure,
  not the first one — but strictly better than nothing.
- **Create a test-mode "Tickets" payment method configuration.** The live one
  (`pmc_1UDAnBL0Q3ZMbggU8t7ijh1h`) is live-mode only, so local checkout still shows
  the wide method list. Its id would go in `apps/web/.env.local`, not Netlify.
- **Confirm Klarna is gone** from live checkout after unselecting "Pay later with
  Klarna" in Link settings.
- **Look at "SingJam at 2727 California"** (2026-07-26, official) — it already
  carries 1 ticket tier and is not test data. Past-dated so it cannot sell, but
  worth knowing why it exists.

## Housekeeping

- **Screenshots were never attached to PR #279**, which CLAUDE.md requires for UI
  changes. Worth adding retrospectively: the guest row under "Who's going", the
  confirmation page, and free checkout showing no card form.
- **Deleting a Supabase user does not remove them from ActiveCampaign.** Two
  separate paths put test accounts in the real mailing list: `syncContact()` runs
  on the signup routes, and the nightly `ac-sync` sweep (`0 3 * * *`) pushes every
  Supabase user regardless of how it was created. Three test contacts were found
  and removed manually on 2026-09-08; `teardown` now deletes the AC contact too,
  outside the `if (user)` branch so it still cleans up when the Supabase user is
  already gone.
- **Test environment is torn down** (confirmed 2026-09-08: `status` reports no
  event and neither account). To bring it back, `node
  scripts/ticketing-test-env.mjs seed`; `teardown` removes the event, tiers,
  orders, tickets, set list, both `+singjam-test-*` accounts and the promo codes.
  Note the two seeded promo rows were already deleted manually on 2026-09-07 —
  they pointed at test-mode Stripe objects and made the live checkout 502 rather
  than cleanly rejecting the code.
