import type { RequestHandler } from "msw";
import { googleHandlers } from "./handlers/google";
import { messagingHandlers } from "./handlers/messaging";
import { musicHandlers } from "./handlers/music";
import { openaiHandlers } from "./handlers/openai";
import { stripeHandlers } from "./handlers/stripe";

export { mockCalls, resetMockCalls, type MockCall, type MockService } from "./calls";
export { stripeHandlers, messagingHandlers, musicHandlers, googleHandlers, openaiHandlers };

// Every outside service the app talks to: Stripe, Resend, ActiveCampaign, Expo push, OpenAI,
// Spotify, Genius, YouTube, Google OAuth and Places, MusicBrainz, Last.fm, SecondHandSongs, Wikidata.
export const handlers: RequestHandler[] = [
  ...stripeHandlers,
  ...messagingHandlers,
  ...openaiHandlers,
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
  print.error();
  throw new Error(`Unmocked outside request: ${request.method} ${request.url}. Add a handler in packages/test-fixtures/src/msw.`);
}
