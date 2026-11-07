import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route";

const store = globalThis as { __e2eMockCalls?: (service?: string) => unknown[] };

afterEach(() => {
  delete store.__e2eMockCalls;
});

describe("GET /api/e2e/mock-calls", () => {
  it("is a 404 unless the e2e mock server is loaded", async () => {
    const res = await GET(new Request("http://localhost/api/e2e/mock-calls"));
    expect(res.status).toBe(404);
  });

  it("returns the recorded calls for a service", async () => {
    store.__e2eMockCalls = (service) => [{ service, url: "https://api.resend.com/emails" }];
    const res = await GET(new Request("http://localhost/api/e2e/mock-calls?service=resend"));
    expect(await res.json()).toEqual([{ service: "resend", url: "https://api.resend.com/emails" }]);
  });
});
