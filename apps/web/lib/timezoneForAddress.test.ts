import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { timezoneForAddress } from "./timezoneForAddress";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "test-key");
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function places(body: unknown, ok = true) {
  mockFetch.mockResolvedValue({ ok, json: async () => body });
}

describe("timezoneForAddress", () => {
  it("returns the IANA zone Places reports for the address", async () => {
    places({ places: [{ timeZone: { id: "America/New_York" } }] });
    expect(await timezoneForAddress("Brooklyn, NY")).toBe("America/New_York");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("places:searchText");
    expect(init.headers["X-Goog-FieldMask"]).toBe("places.timeZone");
    expect(JSON.parse(init.body).textQuery).toBe("Brooklyn, NY");
  });

  it("returns null when Places finds nothing, errors, or reports an unusable zone", async () => {
    places({});
    expect(await timezoneForAddress("nowhere")).toBeNull();
    places({ error: "denied" }, false);
    expect(await timezoneForAddress("Berkeley")).toBeNull();
    places({ places: [{ timeZone: { id: "Not/AZone" } }] });
    expect(await timezoneForAddress("Berkeley")).toBeNull();
    mockFetch.mockRejectedValue(new Error("offline"));
    expect(await timezoneForAddress("Berkeley")).toBeNull();
  });

  it("skips the lookup for a blank address or a missing key", async () => {
    expect(await timezoneForAddress("  ")).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_KEY", "");
    expect(await timezoneForAddress("Berkeley")).toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
