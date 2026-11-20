// Every mocked request is recorded so a test can assert what the app tried to do, e.g. that an
// email went out or a Stripe session was created, without inspecting the handler internals.

export type MockService =
  | "stripe"
  | "resend"
  | "openai"
  | "spotify"
  | "genius"
  | "youtube"
  | "google-oauth"
  | "google-places"
  | "musicbrainz"
  | "lastfm"
  | "secondhandsongs"
  | "wikidata"
  | "activecampaign"
  | "expo-push"
  | "anthropic"
  | "lrclib"
  | "wikipedia"
  | "hymnary";

export type MockCall = { service: MockService; method: string; url: string; body: string };

const calls: MockCall[] = [];

export async function recordCall(service: MockService, request: Request): Promise<string> {
  const body = request.method === "GET" || request.method === "HEAD" ? "" : await request.clone().text();
  calls.push({ service, method: request.method, url: request.url, body });
  return body;
}

export function mockCalls(service?: MockService): MockCall[] {
  return service ? calls.filter((c) => c.service === service) : [...calls];
}

export function resetMockCalls(): void {
  calls.length = 0;
}

// Outside requests that had no handler. MSW answers them with a 500 so they never leave the
// machine; the test runner hook then fails the test that made them.
const unmocked: string[] = [];

export function recordUnmocked(request: Request): void {
  unmocked.push(`${request.method} ${request.url}`);
}

export function takeUnmocked(): string[] {
  return unmocked.splice(0);
}
