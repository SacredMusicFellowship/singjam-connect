import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockServerFrom, mockAdminFrom } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockServerFrom: vi.fn(),
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
    from: mockServerFrom,
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));

import { PUT, DELETE } from "./route";

// Builds a chainable Supabase query mock that resolves at the terminal method.
function chain(result: any, extra: Record<string, any> = {}) {
  const c: any = {};
  for (const m of ["select", "eq", "update", "insert"]) c[m] = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  // Allow plain await (no terminal method) — for update().eq() chains
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  Object.assign(c, extra);
  return c;
}

function putReq(jamId: string, body: object) {
  return new Request(`http://localhost/api/jam/${jamId}/set`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function deleteReq(jamId: string) {
  return new Request(`http://localhost/api/jam/${jamId}/set`, { method: "DELETE" });
}

const HOST_ID = "host-1";
const SET_ID = "set-1";
const JAM_ID = "jam-1";
const jamRow = { host_user_id: HOST_ID };
const setRow = { owner_user_id: HOST_ID, jam_id: null };

function setupSuccess({
  rsvpUserIds = [] as string[],
  existingCollabUserIds = [] as string[],
} = {}) {
  // server client: getJam → getSet
  mockServerFrom
    .mockReturnValueOnce(chain({ data: jamRow }))          // jams
    .mockReturnValueOnce(chain({ data: setRow }));         // sets (select)

  // admin client: updateSet, then rsvps + existing collabs (parallel), then insert
  mockAdminFrom
    .mockReturnValueOnce(chain({ error: null }))           // sets (update)
    .mockReturnValueOnce(chain({ data: rsvpUserIds.map((id) => ({ user_id: id })) }))
    .mockReturnValueOnce(chain({ data: existingCollabUserIds.map((id) => ({ user_id: id })) }))
    .mockReturnValueOnce(chain({ data: null })); // insert (only called if newCollaborators > 0)
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: HOST_ID } } });
  // Default: not a co-host, unless a test overrides with its own mockReturnValueOnce queue.
  mockAdminFrom.mockReturnValue(chain({ data: null }));
});

describe("PUT /api/jam/[id]/set", () => {
  describe("auth and access", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(401);
    });

    it("returns 403 when caller is not the jam host", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "stranger" } } });
      mockServerFrom.mockReturnValueOnce(chain({ data: jamRow }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(403);
    });

    it("returns 403 when jam does not exist", async () => {
      mockServerFrom.mockReturnValueOnce(chain({ data: null }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(403);
    });

    it("returns 400 when setId is missing", async () => {
      mockServerFrom.mockReturnValueOnce(chain({ data: jamRow }));
      const res = await PUT(putReq(JAM_ID, {}), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(400);
    });

    it("returns 403 when caller does not own the set and is not an editor collaborator", async () => {
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: { owner_user_id: "other-user", jam_id: null } }))
        .mockReturnValueOnce(chain({ data: null })); // set_collaborators lookup — no row
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(403);
    });

    it("returns 403 when caller is only a viewer collaborator on the set", async () => {
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: { owner_user_id: "other-user", jam_id: null } }))
        .mockReturnValueOnce(chain({ data: { role: "viewer" } }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(403);
    });

    it("returns 404 when the set does not exist", async () => {
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: null }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(404);
    });
  });

  describe("co-hosts and collaborators", () => {
    it("allows a co-host (not the true host) to link a set they own", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "cohost-1" } } });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: { user_id: "cohost-1" } })) // isJamCohost → true
        .mockReturnValueOnce(chain({ error: null })); // sets update
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: { owner_user_id: "cohost-1", jam_id: null } }));

      // remaining admin calls (rsvps, existing collabs) fall back to the default chain({ data: null })
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(200);
    });

    it("allows linking a set the caller doesn't own but is an accepted editor collaborator on, and persists via the admin client (not the RLS-scoped one)", async () => {
      // Regression test: the "sets_update" RLS policy only allows the owner to
      // update the row, so a non-owning collaborator's own session client
      // would silently no-op this write. It must go through admin.
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow })) // jams (caller is host)
        .mockReturnValueOnce(chain({ data: { owner_user_id: "other-user", jam_id: null } })) // sets select
        .mockReturnValueOnce(chain({ data: { role: "editor" } })); // set_collaborators lookup
      mockAdminFrom.mockReturnValueOnce(chain({ error: null })); // sets update

      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(200);

      const updateChain = mockAdminFrom.mock.results[0].value;
      expect(updateChain.update).toHaveBeenCalledWith({ jam_id: JAM_ID });
      // None of the server (RLS-scoped) client's chains should have been used to update sets.
      for (const result of mockServerFrom.mock.results) {
        expect(result.value.update).not.toHaveBeenCalled();
      }
    });
  });

  describe("successful link", () => {
    it("returns 200 ok", async () => {
      setupSuccess({ rsvpUserIds: ["attendee-1"] });
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true });
    });

    it("inserts jam attendees as editor collaborators", async () => {
      setupSuccess({ rsvpUserIds: ["attendee-1", "attendee-2"] });
      await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      const insertChain = mockAdminFrom.mock.results[3].value;
      expect(insertChain.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ user_id: "attendee-1", role: "editor", status: "accepted" }),
          expect.objectContaining({ user_id: "attendee-2", role: "editor", status: "accepted" }),
        ])
      );
    });

    it("does not re-insert users already in set_collaborators", async () => {
      setupSuccess({ rsvpUserIds: ["attendee-1", "attendee-2"], existingCollabUserIds: ["attendee-1"] });
      await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      const insertChain = mockAdminFrom.mock.results[3].value;
      const inserted: any[] = insertChain.insert.mock.calls[0][0];
      expect(inserted.map((r: any) => r.user_id)).not.toContain("attendee-1");
      expect(inserted.map((r: any) => r.user_id)).toContain("attendee-2");
    });

    it("does not add the set owner as a collaborator", async () => {
      // HOST_ID is both the jam host and the set owner — should not appear in the insert
      setupSuccess({ rsvpUserIds: [HOST_ID, "attendee-1"] });
      await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      const insertChain = mockAdminFrom.mock.results[3].value;
      const inserted: any[] = insertChain.insert.mock.calls[0][0];
      expect(inserted.map((r: any) => r.user_id)).not.toContain(HOST_ID);
    });

    it("does not add the set owner as a collaborator when someone else links the set", async () => {
      // Regression test: linking used to only exclude the *linker's* own id from
      // the auto-added-attendees insert, not the set's actual owner. If the host
      // links a set they don't own, and the real owner is also a jam attendee,
      // the owner would wrongly get a duplicate "editor" collaborator row.
      const OWNER_ID = "owner-1";
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow })) // jams (caller is host)
        .mockReturnValueOnce(chain({ data: { owner_user_id: OWNER_ID, jam_id: null } })) // sets select
        .mockReturnValueOnce(chain({ data: { role: "editor" } })); // set_collaborators lookup (host is an editor collab)
      mockAdminFrom
        .mockReturnValueOnce(chain({ error: null })) // sets update
        .mockReturnValueOnce(chain({ data: [{ user_id: OWNER_ID }, { user_id: "attendee-1" }] })) // rsvps — owner is attending
        .mockReturnValueOnce(chain({ data: [] })) // existing collabs
        .mockReturnValueOnce(chain({ error: null })); // insert

      await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      const insertChain = mockAdminFrom.mock.results[3].value;
      const inserted: any[] = insertChain.insert.mock.calls[0][0];
      expect(inserted.map((r: any) => r.user_id)).not.toContain(OWNER_ID);
      expect(inserted.map((r: any) => r.user_id)).toContain("attendee-1");
    });

    it("skips the insert entirely when there are no new collaborators", async () => {
      // All attendees are already collaborators
      setupSuccess({ rsvpUserIds: ["attendee-1"], existingCollabUserIds: ["attendee-1"] });
      await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      // Only 2 admin from() calls (rsvps + existing collabs), no insert
      expect(mockAdminFrom).toHaveBeenCalledTimes(3);
    });
  });

  describe("set already linked elsewhere", () => {
    const linkedElsewhere = { owner_user_id: HOST_ID, jam_id: "other-jam" };

    it("returns 409 instead of silently moving the set off its current jam", async () => {
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: linkedElsewhere }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ linkedJamId: "other-jam" });
      expect(mockAdminFrom).not.toHaveBeenCalled();
    });

    it("moves the set when the caller confirms with move: true", async () => {
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: linkedElsewhere }));
      mockAdminFrom.mockReturnValueOnce(chain({ error: null }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID, move: true }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(200);
      expect(mockAdminFrom.mock.results[0].value.update).toHaveBeenCalledWith({ jam_id: JAM_ID });
    });

    it("re-linking a set to the jam it is already on needs no confirmation", async () => {
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: { owner_user_id: HOST_ID, jam_id: JAM_ID } }));
      mockAdminFrom.mockReturnValueOnce(chain({ error: null }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(200);
    });

    it("returns 409 with a readable message when the jam already has a set list", async () => {
      mockServerFrom
        .mockReturnValueOnce(chain({ data: jamRow }))
        .mockReturnValueOnce(chain({ data: setRow }));
      mockAdminFrom.mockReturnValueOnce(chain({ error: { code: "23505", message: "duplicate key value violates unique constraint" } }));
      const res = await PUT(putReq(JAM_ID, { setId: SET_ID }), { params: Promise.resolve({ id: JAM_ID }) });
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatch(/already has a set list/);
    });
  });
});

describe("DELETE /api/jam/[id]/set", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(deleteReq(JAM_ID), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is neither host nor co-host", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "stranger" } } });
    mockServerFrom.mockReturnValueOnce(chain({ data: jamRow }));
    const res = await DELETE(deleteReq(JAM_ID), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(403);
  });

  it("allows the host to unlink, persisting via the admin client", async () => {
    mockServerFrom.mockReturnValueOnce(chain({ data: jamRow }));
    mockAdminFrom.mockReturnValueOnce(chain({ error: null })); // sets update
    const res = await DELETE(deleteReq(JAM_ID), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(200);
    const updateChain = mockAdminFrom.mock.results[0].value;
    expect(updateChain.update).toHaveBeenCalledWith({ jam_id: null });
  });

  it("allows a co-host to unlink", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "cohost-1" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { user_id: "cohost-1" } })) // isJamCohost
      .mockReturnValueOnce(chain({ error: null })); // sets update
    mockServerFrom.mockReturnValueOnce(chain({ data: jamRow }));
    const res = await DELETE(deleteReq(JAM_ID), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(200);
  });
});
