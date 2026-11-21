import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } }, FROM_ADDRESS: "SingJam <hello@singjam.org>" }));

// activecampaign.ts reads AC_API_URL/AC_API_KEY into module-level consts at import
// time, so env vars must be stubbed before the (dynamic) import happens.
let deleteContact: typeof import("./activecampaign").deleteContact;
let syncContact: typeof import("./activecampaign").syncContact;
let tagFirstTimeAttendee: typeof import("./activecampaign").tagFirstTimeAttendee;

beforeAll(async () => {
  vi.stubEnv("AC_API_URL", "https://example.activehosted.com");
  vi.stubEnv("AC_API_KEY", "test-key");
  ({ deleteContact, syncContact, tagFirstTimeAttendee } = await import("./activecampaign"));
});

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body) };
}

function emptyResponse(ok = true, status = 200) {
  return { ok, status, text: async () => "" };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockReset();
});

function callsTo(path: string) {
  return mockFetch.mock.calls.filter(([url]) => url === `https://example.activehosted.com/api/3${path}`);
}

describe("syncContact", () => {
  function stubHealthyAC() {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/contact/sync")) return jsonResponse({ contact: { id: "7" } });
      if (url.endsWith("/contacts/7/contactLists")) return jsonResponse({ contactLists: [] });
      return jsonResponse({});
    });
  }

  it("subscribes to all lists and applies the app user tag by default", async () => {
    stubHealthyAC();

    expect(await syncContact("member@example.com")).toEqual([]);
    expect(callsTo("/contactLists")).toHaveLength(3);
    expect(callsTo("/contactTags")).toHaveLength(1);
  });

  it("skips the app user tag when tag is false", async () => {
    stubHealthyAC();

    expect(await syncContact("guest@example.com", {}, { tag: false })).toEqual([]);
    expect(callsTo("/contactLists")).toHaveLength(3);
    expect(callsTo("/contactTags")).toHaveLength(0);
  });

  it("retries a call AC rejects with a 429 instead of reporting it failed", async () => {
    vi.useFakeTimers();
    let tagAttempts = 0;
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/contact/sync")) return jsonResponse({ contact: { id: "7" } });
      if (url.endsWith("/contacts/7/contactLists")) return jsonResponse({ contactLists: [] });
      if (url.endsWith("/contactTags") && ++tagAttempts === 1) return jsonResponse({}, false, 429);
      return jsonResponse({});
    });

    const result = syncContact("member@example.com");
    await vi.runAllTimersAsync();

    expect(await result).toEqual([]);
    expect(tagAttempts).toBe(2);
    vi.useRealTimers();
  });

  it("reports a step that keeps failing after retries", async () => {
    vi.useFakeTimers();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/contact/sync")) return jsonResponse({ contact: { id: "7" } });
      if (url.endsWith("/contacts/7/contactLists")) return jsonResponse({ contactLists: [] });
      if (url.endsWith("/contactTags")) return jsonResponse({}, false, 503);
      return jsonResponse({});
    });

    const result = syncContact("member@example.com");
    await vi.runAllTimersAsync();

    expect(await result).toEqual(["SingJam App User tag"]);
    expect(callsTo("/contactTags")).toHaveLength(3);
    vi.useRealTimers();
  });

  it("does not retry a client error", async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith("/contact/sync")) return jsonResponse({ contact: { id: "7" } });
      if (url.endsWith("/contacts/7/contactLists")) return jsonResponse({ contactLists: [] });
      if (url.endsWith("/contactTags")) return jsonResponse({}, false, 422);
      return jsonResponse({});
    });

    expect(await syncContact("member@example.com")).toEqual(["SingJam App User tag"]);
    expect(callsTo("/contactTags")).toHaveLength(1);
  });
});

describe("deleteContact", () => {
  it("looks up the contact by email and deletes it", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ contacts: [{ id: "42" }] }))
      .mockResolvedValueOnce(emptyResponse());

    const result = await deleteContact("singer@example.com");

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://example.activehosted.com/api/3/contacts?email=singer%40example.com",
      expect.objectContaining({ method: "GET" })
    );
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://example.activehosted.com/api/3/contacts/42",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("treats a missing contact as already deleted, without calling DELETE", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ contacts: [] }));

    const result = await deleteContact("nobody@example.com");

    expect(result).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns false when the delete call fails", async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ contacts: [{ id: "42" }] }))
      .mockResolvedValueOnce(jsonResponse({ error: "boom" }, false, 400));

    const result = await deleteContact("singer@example.com");

    expect(result).toBe(false);
  });
});

describe("tagFirstTimeAttendee", () => {
  it("upserts by email alone and applies the first-time attendee tag", async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url.endsWith("/contact/sync") ? jsonResponse({ contact: { id: "7" } }) : jsonResponse({})
    );

    expect(await tagFirstTimeAttendee("singer@example.com")).toBe(true);
    const [, syncInit] = callsTo("/contact/sync")[0];
    expect(JSON.parse(syncInit.body)).toEqual({ contact: { email: "singer@example.com" } });
    const [, tagInit] = callsTo("/contactTags")[0];
    expect(JSON.parse(tagInit.body)).toEqual({ contactTag: { contact: "7", tag: "37" } });
    expect(callsTo("/contactLists")).toHaveLength(0);
  });

  it("returns false when the tag call is rejected", async () => {
    mockFetch.mockImplementation(async (url: string) =>
      url.endsWith("/contact/sync") ? jsonResponse({ contact: { id: "7" } }) : jsonResponse({ error: "no" }, false, 422)
    );

    expect(await tagFirstTimeAttendee("singer@example.com")).toBe(false);
  });
});
