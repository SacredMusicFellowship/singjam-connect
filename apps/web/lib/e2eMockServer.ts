import { mockCalls, mockServer, onUnhandledRequest } from "@singjam/test-fixtures/msw/node";

// Only imported by instrumentation.ts under E2E=1, so a test can never email, charge or call a
// real API. Google Fonts stays reachable: next/font downloads Inter while compiling, and that has
// no side effects.
const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

mockServer.listen({
  onUnhandledRequest: (request, print) => {
    if (FONT_HOSTS.has(new URL(request.url).hostname)) return;
    onUnhandledRequest(request, print);
  },
});

// `next dev` puts back the fetch it saw at startup every time it recompiles, which would quietly
// remove MSW and let requests reach the real services. Next's own patched fetch (marked
// __nextPatched) is let through, since it wraps whatever is installed; any other replacement is
// that reset, so MSW's fetch goes back in its place.
const mockedFetch = globalThis.fetch;
let currentFetch = mockedFetch;
Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  get: () => currentFetch,
  set: (next: typeof fetch & { __nextPatched?: boolean }) => {
    currentFetch = next?.__nextPatched ? next : mockedFetch;
  },
});

// Read by app/api/e2e/mock-calls, so a Playwright test can see what the server tried to send.
(globalThis as { __e2eMockCalls?: typeof mockCalls }).__e2eMockCalls = mockCalls;
