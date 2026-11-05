import { setupServer } from "msw/node";
import { handlers, onUnhandledRequest, resetMockCalls } from "./index";

export * from "./index";

export const mockServer = setupServer(...handlers);

// Call from a test runner's setup file. It starts intercepting straight away rather than in
// beforeAll: a test file that replaces global fetch with its own mock while loading then wins over
// MSW, as it did before, and everything else goes through the handlers. Per-test overrides and the
// call log are reset after each test.
export function installMockServer(hooks: {
  afterEach: (fn: () => void) => void;
  afterAll: (fn: () => void) => void;
}): void {
  mockServer.listen({ onUnhandledRequest });
  hooks.afterEach(() => {
    mockServer.resetHandlers();
    resetMockCalls();
  });
  hooks.afterAll(() => mockServer.close());
}
