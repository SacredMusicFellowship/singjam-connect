import { mockServer, onUnhandledRequest } from "@singjam/test-fixtures/msw/node";

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
