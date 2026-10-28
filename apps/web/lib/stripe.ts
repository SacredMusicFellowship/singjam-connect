import Stripe from "stripe";
import { stripeDevFetch } from "./devSafety";

let client: Stripe | null = null;

// Constructed lazily on first call, not at module load, and memoised after.
// stripe-node throws "Neither apiKey nor config.authenticator provided" when the
// key is missing, and Next evaluates route modules while collecting page data —
// so a module-level `new Stripe(...)` fails the build on any machine without the
// key set, including CI and Netlify. Same shape as supabaseAdmin() for the same
// reason. (lib/resend.ts can get away with module-level construction only
// because Resend tolerates an undefined key.)
//
// STRIPE_RESTRICTED_KEY holds a restricted key (rk_), not a secret key (sk_) —
// least privilege, so a leak can do far less. Keep separate keys per environment.
export function stripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_RESTRICTED_KEY;
    if (!key) throw new Error("STRIPE_RESTRICTED_KEY is not set");
    // apiVersion is deliberately not passed: stripe-node v12+ pins the API
    // version to the installed package release, and overriding it desynchronises
    // the TypeScript types from the wire format. Match the webhook endpoint's
    // version to the SDK instead of pinning here.
    client = new Stripe(
      key,
      // Under `next dev` only, so production keeps stripe-node's default transport.
      process.env.NODE_ENV === "development"
        ? { httpClient: Stripe.createFetchHttpClient(stripeDevFetch) }
        : undefined,
    );
  }
  return client;
}

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";

// Tags Checkout Sessions so flows can be compared in the Dashboard. Stripe asks
// for an 8-random-letter suffix on the label.
export const TICKET_INTEGRATION_ID = "singjam_tickets_qxwmvpht";

// Buy-now-pay-later is a poor fit for a $15 concert ticket, so it is excluded
// from ticket checkouts specifically rather than disabled account-wide — the org
// may still want it elsewhere. Klarna was the one actually surfacing; affirm and
// afterpay_clearpay are also active on the account and would appear at higher
// ticket prices, so they are excluded for the same reason.
//
// This is the supported way to narrow the offering. Never reach for
// payment_method_types — that would disable dynamic payment methods entirely and
// freeze the list at whatever we hardcode.
// A payment method configuration that lists ONLY what we want on a ticket
// checkout. Set STRIPE_TICKET_PM_CONFIG to a pmc_… id to use one.
//
// Why this exists on top of EXCLUDED_PAYMENT_METHODS: excluding a type keeps it
// off the session — verified, the session's payment_method_types really does
// come back without klarna — but the Payment Element was still showing Klarna
// and a bank option to buyers. The account's default configuration has klarna
// and affirm switched on, and the Element appears to render from that rather
// than from the session's narrowed list. Naming a configuration removes the
// discrepancy at the source instead of subtracting from it afterwards.
//
// Unset is safe: the session falls back to the default configuration with the
// exclusions below, which is exactly today's behaviour.
export const TICKET_PM_CONFIG = process.env.STRIPE_TICKET_PM_CONFIG || null;

export const EXCLUDED_PAYMENT_METHODS = [
  "klarna",
  "affirm",
  "afterpay_clearpay",
] as const;

// Stripe rejects expires_at below 30 minutes from creation, so that is the floor
// for the payable window.
export const SESSION_EXPIRY_MINUTES = 30;

// The database hold must OUTLIVE the Stripe session, not match it. Stripe refuses
// payment on an expired session, so making the session die first guarantees any
// successful payment arrives while the order is still 'pending' — which is the
// state the webhook's guarded update requires. Were the hold shorter, a payment
// at minute 29 could land after the sweeper released the stock and resold it:
// money taken, no ticket, and the webhook's `.eq("status", "pending")` silently
// matching nothing.
export const HOLD_MINUTES = SESSION_EXPIRY_MINUTES + 5;
