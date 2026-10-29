// `next dev` runs with the real Resend, Stripe and ActiveCampaign keys in
// .env.local, so clicking around locally could email real people or create real
// orders. Those paths check this first; database writes and uploads are left
// alone on purpose, except notifications, which land in real people's inboxes
// and on their phones. Only `next dev` sets NODE_ENV=development — production
// builds, deploy previews and Vitest never do. Set ALLOW_DEV_SIDE_EFFECTS=true
// to opt back in.
export function devGuardOn(): boolean {
  return process.env.NODE_ENV === "development" && process.env.ALLOW_DEV_SIDE_EFFECTS !== "true";
}

export function sideEffectsBlocked(what: string): boolean {
  const blocked = devGuardOn();
  if (blocked) console.log(`[dev-safety] blocked ${what} (set ALLOW_DEV_SIDE_EFFECTS=true to allow)`);
  return blocked;
}

// Ticket holds, orders and fulfilment are refused under `next dev` even with
// ALLOW_DEV_SIDE_EFFECTS=true: a hold takes real stock off sale on the
// production event, and nobody testing locally means that.
export function inNextDev(): boolean {
  return process.env.NODE_ENV === "development";
}

export function ticketingBlocked(what: string): boolean {
  const blocked = inNextDev();
  if (blocked) console.log(`[dev-safety] blocked ${what} (always blocked under next dev)`);
  return blocked;
}

export const DEV_SAFETY_ERROR = "dev_side_effects_blocked";

export const STRIPE_DISABLED_MESSAGE = "Stripe calls are disabled in local development";

const requestMethod = (input: RequestInfo | URL, init?: RequestInit) =>
  (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();

const requestPath = (input: RequestInfo | URL) =>
  new URL(input instanceof Request ? input.url : String(input)).pathname;

// Stripe reads (retrieving sessions, coupons, payment intents) are GETs; every
// create, update and delete is a POST or DELETE.
export async function stripeDevFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = requestMethod(input, init);
  if (method === "GET" || method === "HEAD") return globalThis.fetch(input, init);
  if (!sideEffectsBlocked(`Stripe ${method} ${requestPath(input)}`)) return globalThis.fetch(input, init);
  return new Response(
    JSON.stringify({ error: { type: "invalid_request_error", code: DEV_SAFETY_ERROR, message: STRIPE_DISABLED_MESSAGE } }),
    { status: 403, headers: { "content-type": "application/json" } },
  );
}

// A jam saved from `next dev` goes straight onto the live site, so new jams
// (including copies) are saved private. An edit may make a jam private but not
// public; an existing public jam, like the live event you're checking, keeps
// what it has.
export const DEV_PRIVATE_JAMS_MESSAGE = "Local dev: jams can only be made private";

export function visibilityForNewJam<V extends string>(requested: V, privateOnly: boolean): V | "private" {
  return privateOnly ? "private" : requested;
}

export function devRefusesVisibility(current: string, requested: string | undefined): boolean {
  if (requested === undefined || requested === "private" || requested === current) return false;
  return sideEffectsBlocked(`changing a jam to ${requested}`);
}
