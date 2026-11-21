import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockBearerGetUser, mockLookup } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockLookup: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: mockBearerGetUser } })),
}));
vi.mock("@/lib/timezoneForAddress", () => ({ timezoneForAddress: mockLookup }));

import { GET } from "./route";

function get(query: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/timezone${query}`, { headers }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mockLookup.mockResolvedValue("America/New_York");
});

describe("GET /api/timezone", () => {
  it("returns the timezone for the address", async () => {
    const res = await get("?address=Brooklyn%2C%20NY");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ timezone: "America/New_York" });
    expect(mockLookup).toHaveBeenCalledWith("Brooklyn, NY");
  });

  it("accepts a bearer token from the native app", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await get("?address=Berkeley", { Authorization: "Bearer token" });
    expect(res.status).toBe(200);
  });

  it("requires a signed-in user so the Maps key can't be used anonymously", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await get("?address=Berkeley");
    expect(res.status).toBe(401);
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("rejects a missing address", async () => {
    const res = await get("");
    expect(res.status).toBe(400);
  });
});
