import { afterAll, afterEach } from "vitest";
import { installMockServer } from "@singjam/test-fixtures/msw/node";

// Every outside service (Stripe, Resend, Spotify, …) is answered by MSW during tests, and any
// unmocked outside request fails the test instead of reaching a real service.
process.env.MOCK_OUTSIDE_SERVICES = "true";
installMockServer({ afterEach, afterAll });
