import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockAdminFrom, mockBearerGetUser, mockSupabaseFromBearer } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockSupabaseFromBearer: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));

vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: mockSupabaseFromBearer,
}));

import { PATCH } from "./route";

// Chainable mock for select().eq()...maybeSingle().
function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "in"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.single = vi.fn().mockResolvedValue(result);
  return c;
}

// Chainable mock for update().eq() calls awaited directly (no terminal method).
function updateChain(result: any) {
  const c: any = {};
  c.update = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function req(setId: string, body: object) {
  return new Request(`http://localhost/api/sets/${setId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OWNER_ID = "owner-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: OWNER_ID } } });
  mockSupabaseFromBearer.mockReturnValue({ auth: { getUser: mockBearerGetUser } });
});

function bearerReq(setId: string, body: object) {
  return new Request(`http://localhost/api/sets/${setId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer native-token" },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/sets/[id]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(req("set-1", { link_sharing: "public" }), {
      params: Promise.resolve({ id: "set-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is neither owner nor co-owner", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "editor-1" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null })) // not owner
      .mockReturnValueOnce(chain({ data: null })); // not a co-owner
    const res = await PATCH(req("set-1", { link_sharing: "public" }), {
      params: Promise.resolve({ id: "set-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("lets the owner change visibility", async () => {
    const updateSpy = updateChain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: "set-1" } })) // owner check: owns
      .mockReturnValueOnce(chain({ data: null })) // co-owner check unused
      .mockReturnValueOnce(updateSpy);
    const res = await PATCH(req("set-1", { link_sharing: "public" }), {
      params: Promise.resolve({ id: "set-1" }),
    });
    expect(res.status).toBe(200);
    expect(updateSpy.update).toHaveBeenCalledWith(expect.objectContaining({ link_sharing: "public" }));
  });

  it("lets an accepted co-owner change visibility", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "co-1" } } });
    const updateSpy = updateChain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null })) // not owner
      .mockReturnValueOnce(chain({ data: { id: "collab-1" } })) // is a co-owner
      .mockReturnValueOnce(updateSpy);
    const res = await PATCH(req("set-1", { link_sharing: "private" }), {
      params: Promise.resolve({ id: "set-1" }),
    });
    expect(res.status).toBe(200);
    expect(updateSpy.update).toHaveBeenCalledWith(expect.objectContaining({ link_sharing: "private" }));
  });

  it("rejects an invalid link_sharing value from a manager", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: "set-1" } })) // owner
      .mockReturnValueOnce(chain({ data: null }));
    const res = await PATCH(req("set-1", { link_sharing: "bogus" }), {
      params: Promise.resolve({ id: "set-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("authenticates a co-owner via bearer token when there is no cookie session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } }); // no cookie session (native app)
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: "co-1" } } });
    const updateSpy = updateChain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null })) // not owner
      .mockReturnValueOnce(chain({ data: { id: "collab-1" } })) // is a co-owner
      .mockReturnValueOnce(updateSpy);
    const res = await PATCH(bearerReq("set-1", { link_sharing: "public" }), {
      params: Promise.resolve({ id: "set-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockSupabaseFromBearer).toHaveBeenCalledWith("native-token");
    expect(updateSpy.update).toHaveBeenCalledWith(expect.objectContaining({ link_sharing: "public" }));
  });

  it("refuses a UG playlist link that isn't a web address", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: "set-1" } }))
      .mockReturnValueOnce(chain({ data: null }));
    const res = await PATCH(req("set-1", { ultimate_guitar_playlist_url: "javascript:alert(1)" }), {
      params: Promise.resolve({ id: "set-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  it("saves a UG playlist web address, and clears it when empty", async () => {
    for (const [input, saved] of [[" https://www.ultimate-guitar.com/p/1 ", "https://www.ultimate-guitar.com/p/1"], ["", null]] as const) {
      vi.clearAllMocks();
      const updateSpy = updateChain({ error: null });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: { id: "set-1" } }))
        .mockReturnValueOnce(chain({ data: null }))
        .mockReturnValueOnce(updateSpy);
      const res = await PATCH(req("set-1", { ultimate_guitar_playlist_url: input }), {
        params: Promise.resolve({ id: "set-1" }),
      });
      expect(res.status).toBe(200);
      expect(updateSpy.update).toHaveBeenCalledWith(expect.objectContaining({ ultimate_guitar_playlist_url: saved }));
    }
  });
});
