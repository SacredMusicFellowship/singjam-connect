import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockAdminFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));

import { PATCH, DELETE } from "./route";

// Chainable query builder mock for select().eq()...maybeSingle()/single() calls.
function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "insert", "in"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.single = vi.fn().mockResolvedValue(result);
  return c;
}

// Chainable mock for update().eq().eq() calls that are awaited directly (no terminal method).
function updateChain(result: any) {
  const c: any = {};
  c.update = vi.fn().mockReturnValue(c);
  c.eq = vi.fn().mockReturnValue(c);
  c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return c;
}

function req(setId: string, songId: string, body: object) {
  return new Request(`http://localhost/api/sets/${setId}/songs/${songId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OWNER_ID = "owner-1";
const setRow = { id: "set-1" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: OWNER_ID } } });
});

describe("PATCH /api/sets/[id]/songs/[songId]", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await PATCH(req("set-1", "song-1", { played: true }), {
      params: Promise.resolve({ id: "set-1", songId: "song-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is neither owner nor an accepted collaborator", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "stranger-1" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null })) // not owner
      .mockReturnValueOnce(chain({ data: null })); // not a collaborator
    const res = await PATCH(req("set-1", "song-1", { played: true }), {
      params: Promise.resolve({ id: "set-1", songId: "song-1" }),
    });
    expect(res.status).toBe(403);
  });

  it("updates the played field and returns ok", async () => {
    const updateSpy = updateChain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: setRow })) // owner check: owns
      .mockReturnValueOnce(chain({ data: null })) // collaborator check unused
      .mockReturnValueOnce(updateSpy);

    const res = await PATCH(req("set-1", "song-1", { played: true }), {
      params: Promise.resolve({ id: "set-1", songId: "song-1" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(updateSpy.update).toHaveBeenCalledWith({ played: true });
  });

  it("saves a trimmed note, and clears a blank one", async () => {
    for (const [notes, saved] of [["  Capo 3  ", "Capo 3"], ["   ", null]] as const) {
      const updateSpy = updateChain({ error: null });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))
        .mockReturnValueOnce(chain({ data: null }))
        .mockReturnValueOnce(updateSpy);
      const res = await PATCH(req("set-1", "song-1", { notes }), {
        params: Promise.resolve({ id: "set-1", songId: "song-1" }),
      });
      expect(res.status).toBe(200);
      expect(updateSpy.update).toHaveBeenCalledWith({ notes: saved });
    }
  });

  // A query awaited directly (no terminal call), e.g. upsert(...) or select().eq().in().
  function awaited(result: any) {
    const c: any = {};
    for (const m of ["select", "eq", "in", "upsert"]) c[m] = vi.fn().mockReturnValue(c);
    c.maybeSingle = vi.fn().mockResolvedValue(result);
    c.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
    return c;
  }

  it("switches the set key to a newly selected leader's own key", async () => {
    const updateSpy = updateChain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: setRow }))
      .mockReturnValueOnce(chain({ data: null }))
      .mockReturnValueOnce(awaited({ data: { leader_user_ids: [] } })) // current leaders
      .mockReturnValueOnce(awaited({ error: null })) // mark leaders as "lead"
      .mockReturnValueOnce(awaited({ data: [{ user_id: "ana", key_note: "G" }] })) // their keys
      .mockReturnValueOnce(updateSpy);
    const res = await PATCH(req("set-1", "song-1", { leader_user_ids: ["ana"] }), {
      params: Promise.resolve({ id: "set-1", songId: "song-1" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, key_note: "G" });
    expect(updateSpy.update).toHaveBeenCalledWith({ leader_user_ids: ["ana"], key_note: "G" });
  });

  it("leaves the set key alone when a leader is only removed", async () => {
    const updateSpy = updateChain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: setRow }))
      .mockReturnValueOnce(chain({ data: null }))
      .mockReturnValueOnce(awaited({ data: { leader_user_ids: ["ana", "ben"] } }))
      .mockReturnValueOnce(awaited({ error: null }))
      .mockReturnValueOnce(updateSpy);
    const res = await PATCH(req("set-1", "song-1", { leader_user_ids: ["ana"] }), {
      params: Promise.resolve({ id: "set-1", songId: "song-1" }),
    });
    expect(await res.json()).toEqual({ ok: true });
    expect(updateSpy.update).toHaveBeenCalledWith({ leader_user_ids: ["ana"] });
  });

  it("rejects a note over 200 characters without writing", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: setRow }))
      .mockReturnValueOnce(chain({ data: null }));
    const res = await PATCH(req("set-1", "song-1", { notes: "x".repeat(201) }), {
      params: Promise.resolve({ id: "set-1", songId: "song-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });

  describe("event guests (editors and viewers)", () => {
    const GUEST_ID = "guest-1";
    const params = { params: Promise.resolve({ id: "set-1", songId: "song-1" }) };

    function asGuest(role: "editor" | "viewer") {
      mockGetUser.mockResolvedValue({ data: { user: { id: GUEST_ID } } });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: null })) // not the owner
        .mockReturnValueOnce(chain({ data: { role } }));
    }

    it.each([
      ["key_note", { key_note: "D" }],
      ["played", { played: true }],
      ["notes", { notes: "Capo 3" }],
      ["leader_user_ids", { leader_user_ids: ["someone-else"] }],
    ])("refuses an editor changing %s, without writing", async (_field, body) => {
      asGuest("editor");
      const res = await PATCH(req("set-1", "song-1", body), params);
      expect(res.status).toBe(403);
      expect(mockAdminFrom).toHaveBeenCalledTimes(2);
    });

    it("lets a co-owner change the key", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "co-1" } } });
      const updateSpy = updateChain({ error: null });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: null }))
        .mockReturnValueOnce(chain({ data: { role: "co-owner" } }))
        .mockReturnValueOnce(updateSpy);
      const res = await PATCH(req("set-1", "song-1", { key_note: "D" }), params);
      expect(res.status).toBe(200);
      expect(updateSpy.update).toHaveBeenCalledWith({ key_note: "D" });
    });

    it.each(["editor", "viewer"] as const)("lets a %s who leads the song pick themselves, keeping other leaders", async (role) => {
      asGuest(role);
      const updateSpy = updateChain({ error: null });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: { leader_user_ids: ["ana"], key_note: "C" } }))
        .mockReturnValueOnce(chain({ data: { confidence: "lead", key_note: "G" } }))
        .mockReturnValueOnce(updateSpy);
      const res = await PATCH(req("set-1", "song-1", { self_leader: true }), params);
      expect(res.status).toBe(200);
      // The set already has a key, so the guest's own key doesn't replace it.
      expect(updateSpy.update).toHaveBeenCalledWith({ leader_user_ids: ["ana", GUEST_ID] });
      expect(await res.json()).toEqual({ ok: true, leader_user_ids: ["ana", GUEST_ID] });
    });

    it("fills an empty set key with the guest's own key", async () => {
      asGuest("editor");
      const updateSpy = updateChain({ error: null });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: { leader_user_ids: [], key_note: null } }))
        .mockReturnValueOnce(chain({ data: { confidence: "lead", key_note: "G" } }))
        .mockReturnValueOnce(updateSpy);
      const res = await PATCH(req("set-1", "song-1", { self_leader: true }), params);
      expect(updateSpy.update).toHaveBeenCalledWith({ leader_user_ids: [GUEST_ID], key_note: "G" });
      expect(await res.json()).toEqual({ ok: true, leader_user_ids: [GUEST_ID], key_note: "G" });
    });

    it("refuses a guest who doesn't lead the song", async () => {
      asGuest("viewer");
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: { leader_user_ids: [], key_note: null } }))
        .mockReturnValueOnce(chain({ data: { confidence: "support", key_note: null } }));
      const res = await PATCH(req("set-1", "song-1", { self_leader: true }), params);
      expect(res.status).toBe(403);
      expect(mockAdminFrom).toHaveBeenCalledTimes(4);
    });

    it("lets a guest step down without touching the other leaders", async () => {
      asGuest("editor");
      const updateSpy = updateChain({ error: null });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: { leader_user_ids: ["ana", GUEST_ID], key_note: "C" } }))
        .mockReturnValueOnce(chain({ data: { confidence: "lead", key_note: null } }))
        .mockReturnValueOnce(updateSpy);
      const res = await PATCH(req("set-1", "song-1", { self_leader: false }), params);
      expect(res.status).toBe(200);
      expect(updateSpy.update).toHaveBeenCalledWith({ leader_user_ids: ["ana"] });
    });
  });
});

describe("DELETE /api/sets/[id]/songs/[songId]", () => {
  const params = { params: Promise.resolve({ id: "set-1", songId: "song-1" }) };
  const del = () => new Request("http://localhost/api/sets/set-1/songs/song-1", { method: "DELETE" });

  it("refuses anyone who isn't the owner or a co-owner, without deleting", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "guest-1" } } });
    const coOwnerCheck = chain({ data: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null }))
      .mockReturnValueOnce(coOwnerCheck);
    const res = await DELETE(del(), params);
    expect(res.status).toBe(403);
    expect(coOwnerCheck.eq).toHaveBeenCalledWith("role", "co-owner");
    expect(mockAdminFrom).toHaveBeenCalledTimes(2);
  });
});
