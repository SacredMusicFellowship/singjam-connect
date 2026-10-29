# Ticketing test environment

Everything is running. Open the links below and click through.

## The port must be 3000

The Stripe return URL is built from `SITE_URL` in `apps/web/lib/stripe.ts`, which
reads `NEXT_PUBLIC_SITE_URL` — and `.env.local` sets that to `http://localhost:3000`.
Run the dev server on any other port and the payment still succeeds, the webhook
still fulfils, but Stripe bounces the buyer to port 3000 and they get
`ERR_CONNECTION_REFUSED` instead of their ticket. Nothing is broken when that
happens; the order is paid and the completion page is reachable by hand at
`/jam/<id>/tickets/complete?session_id=<cs_test_…>` on the right port.

## Verified end to end (2026-09-07)

A real guest purchase was completed in a real browser: card accepted,
`checkout.session.completed` and `payment_intent.succeeded` both delivered 200 to
the webhook, order moved to `paid`, stock decremented to 1/20, a ticket row was
issued, and the completion page rendered "You're going to …". The previously
suspect **Pay** button works.

This closes the one thing the earlier session could not prove: Stripe loads an
invisible hCaptcha that headless browsers routinely fail, so `confirm()` never
resolved for automation and returned no error to inspect. It needed a human.

## Links

| | |
|---|---|
| Event page (buyer) | http://localhost:3000/jam/a13e41a1-ef3f-437b-9b34-7ec1a6ff09fd |
| Tickets & guest list (host) | http://localhost:3000/jam/a13e41a1-ef3f-437b-9b34-7ec1a6ff09fd/tickets/manage |

## Accounts

| Persona | Email | Password |
|---|---|---|
| Event host | `benkramarz+singjam-test-host@gmail.com` | see below |
| Member | `benkramarz+singjam-test-member@gmail.com` | see below |
| Guest buyer | no account — use a private window | — |

Both are `+aliases` on your own address, so ticket emails land in your inbox.

These are real accounts on the production Supabase project, and this repo is
public, so the shared password lives in `apps/web/.env.local` (gitignored) as
`TICKETING_TEST_PASSWORD`. The seed script reads it from there and refuses to
run without it.

The host account is deliberately **not an admin**. It's a plain member with
`can_host_official = true`, so it exercises the capability added in migration 156.

## Test payment details

- Card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode
- Promo code **`SINGJAMTEST`** — 25% off
- Promo code **`SINGJAMFREE`** — 100% off, and skips the payment step entirely
- Everything is Stripe **test mode**. No real money moves.

## What a ticket now buys

An official event used to be a dead end: no guest list, and a set list anyone
could read but nobody could add to. It now behaves like any other jam, gated by
the ticket:

| | Read the set | Add songs | On the guest list |
|---|---|---|---|
| Nobody in particular | yes | no | — |
| Guest buyer (no account) | yes | no | **yes** |
| Member buyer | yes | **yes** | **yes** |
| Host / co-host | yes | yes | yes |

Everyone who is coming is listed, account or not — a guest appears under their
purchase name, with `+N` if one order covered several people. An account is what
earns you set-list editing (and a faster checkout next time), not a place on the
list.

A guest who later signs up **with the address they bought under** has their order
attached automatically, which moves them from the guest rows into a real profile
row and unlocks the set. The seeded event has a linked set list with 3 songs so
there is something to be let into.

Guest names come from `GET /api/jam/<id>/attendees/guests`, which returns names
only — the door list with emails and codes stays host-gated at
`/api/jam/<id>/tickets/orders`.

## Five passes worth doing

**As a guest** (private window, don't sign in)
Pick tickets → name and email appear inline, no sign-in wall → optionally
"＋ Promo Code" → `SINGJAMTEST` → Buy → the card form is open straight away
→ pay → completion page, plus an email with a 6-character
door code. The completion page should now also offer **Create an account**, and
name the address to use.

**As a member** (sign in as the member account)
Same flow, no name/email step. After paying you should appear under **Who's going**
on the event page — that panel is new for official events — and you should be able
to add a song to the set list, which you could not do before buying.

**Claiming a guest order** (the new path)
Sign **up**, not in — the address has no account, and creating one is what
triggers the claim. There is an unclaimed paid guest order under
`singjammusic613@gmail.com` from the 2026-09-07 test purchase waiting for exactly
this. Google sign-in is the one-click route for a gmail address; email/password
works too. On success the order gains a buyer, and you appear as going with
set-list access.

Verify with `node scripts/ticketing-test-env.mjs status` — "unclaimed guest
orders" should drop to 0, "attending" should rise, and the set list should gain a
collaborator.

Don't want to spend a real address? Buy a fresh guest ticket under any
`benkramarz+something@gmail.com` alias first, then sign up with that.

This path was rehearsed end to end on 2026-09-07 against the real database and
the real `/api/auth/complete` route — order claimed, ticket holder set, RSVP
`attending`, collaborator role `editor` — using a disposable alias that was then
deleted.

**A free ticket** (any window, guest or member)
Pick a ticket → `SINGJAMFREE` → the total goes to $0.00 → **Buy should take you
straight to the confirmation, with no card form at all.** A zero total never
reaches Stripe: the order is fulfilled server-side through the same code the
webhook uses, so the ticket, the email and the guest-list entry all still happen.
Verified 2026-09-07 against the running stack — `stripe_checkout_session_id` came
back `null` on a paid, $0, ticketed order.

**As the host** (sign in as the host account)
Open the manage page. Add and delete tiers; try deleting one that has sales (it
refuses on purpose). Watch sold / gross / checked-in update. Search the guest
list by name, email or code, and use **Check in** — tap again to undo.

## Why the event is dated April

Official events are world-readable, and the jams listing only fetches the last
90 days. Dating this one **120 days in the past** keeps it out of every public
listing, upcoming and past, while still working on a direct link. Verified: it's
absent from both queries as an anonymous visitor, and `ticket_orders` / `tickets`
aren't readable anonymously at all.

It does mean you're reviewing an event dated April. That's the price of not
putting a test event on the live site.

## Payment methods

Verified 2026-09-07 by creating a session with the route's exact parameters and
reading back what Stripe resolved:

```
with exclusions   : card, link, cashapp, amazon_pay
without exclusions: card, klarna, link, cashapp, amazon_pay
```

So the BNPL exclusion works — Klarna is genuinely gone. An earlier note here
claimed the Element still advertised Klarna and Bank despite the exclusion; that
was wrong, or was read off a session created before the exclusion landed.

**But no payment method domain is registered** (`payment_method_domains` is
empty), and Elements *requires* registration for Apple Pay, Google Pay, Link and
Amazon Pay. So of the four methods the session offers, three probably can't
render — which is why checkout collapses to a lone "Card" accordion row. That,
not PayPal, is the conversion fix. Register at
dashboard.stripe.com/settings/payment_method_domains.

PayPal is not available: PayPal-through-Stripe is limited to European business
locations and this account is US. See `docs/TICKETING.md`.

## Running it again

```bash
# from the repo root
node scripts/ticketing-test-env.mjs status     # what exists right now
node scripts/ticketing-test-env.mjs seed       # idempotent — safe to re-run
node scripts/ticketing-test-env.mjs teardown   # removes event, tiers, orders, accounts, promo code
```

Services, if they need restarting:

```bash
cd apps/web && PORT=3000 npm run dev
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

`stripe listen` must be running or payments will complete at Stripe and the order
will sit at "Confirming your payment…" forever — localhost isn't reachable from
Stripe's servers. Its signing secret already matches `.env.local`.

**Don't run `npm run build` while the dev server is up** — they share `.next` and
the build wipes it out from under the running server.

## When you're done

Run `teardown`. It removes the event, its tiers, orders and tickets, both test
accounts, and deactivates the promo code — production goes back to how it was.
