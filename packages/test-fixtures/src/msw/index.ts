import type { RequestHandler } from "msw";
import { anthropicHandlers } from "./handlers/anthropic";
import { googleHandlers } from "./handlers/google";
import { messagingHandlers } from "./handlers/messaging";
import { musicHandlers } from "./handlers/music";
import { openaiHandlers } from "./handlers/openai";
import { stripeHandlers } from "./handlers/stripe";

import { recordUnmocked } from "./calls";

export { mockCalls, resetMockCalls, takeUnmocked, type MockCall, type MockService } from "./calls";
export { stripeHandlers, messagingHandlers, musicHandlers, googleHandlers, openaiHandlers, anthropicHandlers };

// Every outside service the app talks to: Stripe, Resend, ActiveCampaign, Expo push, OpenAI,
// Anthropic, Spotify, Genius, YouTube, Google OAuth and Places, MusicBrainz, Last.fm,
// SecondHandSongs, Wikidata, LRCLIB, Wikipedia and Hymnary.org.
export const handlers: RequestHandler[] = [
  ...stripeHandlers,
  ...messagingHandlers,
  ...openaiHandlers,
  ...anthropicHandlers,
  ...musicHandlers,
  ...googleHandlers,
];

// Local services (the Next server, local Supabase, Metro) pass through untouched.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0", "host.docker.internal"]);

export function isLocalRequest(url: string | URL): boolean {
  const { hostname } = new URL(url);
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith(".localhost");
}

// For setupServer({ onUnhandledRequest }). A request to any outside host without a handler fails
// the test, so a new integration can never quietly hit a real service from the test suite.
export function onUnhandledRequest(request: Request, print: { error: () => void }): void {
  if (isLocalRequest(request.url)) return;
  recordUnmocked(request);
  print.error();
  throw new Error(`Unmocked outside request: ${request.method} ${request.url}. Add a handler in packages/test-fixtures/src/msw.`);
}
