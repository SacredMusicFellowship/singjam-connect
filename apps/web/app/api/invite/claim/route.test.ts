import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockClaim } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockClaim: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));

// The claim rules themselves are covered in lib/claimJamInvite.test.ts.
vi.mock("@/lib/claimJamInvite", () => ({ claimJamInvite: mockClaim }));
vi.mock("@/lib/shortRef", () => ({ jamPathById: async (id: string) => `/jam/code-for-${id}` }));

import { POST } from "./route";

function makeReq(body: object) {
  return new Request("http://localhost/api/invite/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const TOKEN = "token-abc";

beforeEach(() => vi.clearAllMocks());

describe("POST /api/invite/claim", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ token: TOKEN }));
    expect(res.status).toBe(401);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("returns 400 when token is missing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("delegates to claimJamInvite and returns the jam id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockClaim.mockResolvedValue("jam-1");

    const res = await POST(makeReq({ token: TOKEN }));
    expect(res.status).toBe(200);
    expect(mockClaim).toHaveBeenCalledWith(TOKEN, "user-1");
    expect(await res.json()).toMatchObject({ ok: true, jamId: "jam-1", jamPath: "/jam/code-for-jam-1" });
  });

  it("returns a null jamId when the token matches nothing", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockClaim.mockResolvedValue(null);

    const res = await POST(makeReq({ token: TOKEN }));
    expect(await res.json()).toMatchObject({ ok: true, jamId: null, jamPath: null });
  });
});
