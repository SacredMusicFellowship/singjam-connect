import { setupServer } from "msw/node";
import { handlers, onUnhandledRequest, resetMockCalls, takeUnmocked } from "./index";

export * from "./index";

export const mockServer = setupServer(...handlers);

// Call from a test runner's setup file. It starts intercepting straight away rather than in
// beforeAll: a test file that replaces global fetch with its own mock while loading then wins over
// MSW, as it did before, and everything else goes through the handlers. Per-test overrides and the
// call log are reset after each test, and a test that made an outside request with no handler
// fails even if its own code swallowed the 500 MSW answered with.
export function installMockServer(hooks: {
  afterEach: (fn: () => void) => void;
  afterAll: (fn: () => void) => void;
}): void {
  mockServer.listen({ onUnhandledRequest });
  hooks.afterEach(() => {
    mockServer.resetHandlers();
    resetMockCalls();
    const unmocked = takeUnmocked();
    if (unmocked.length) {
      throw new Error(`Unmocked outside request(s): ${unmocked.join(", ")}. Add a handler in packages/test-fixtures/src/msw.`);
    }
  });
  hooks.afterAll(() => mockServer.close());
}
