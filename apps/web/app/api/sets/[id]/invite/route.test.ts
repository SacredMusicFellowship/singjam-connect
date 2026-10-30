import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetUser,
  mockAdminFrom,
  mockAdminGetUserById,
  mockAdminListUsers,
  mockResendSend,
  mockCreateNotification,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockAdminGetUserById: vi.fn(),
  mockAdminListUsers: vi.fn(),
  mockResendSend: vi.fn(),
  mockCreateNotification: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockAdminFrom,
    auth: {
      admin: {
        getUserById: mockAdminGetUserById,
        listUsers: mockAdminListUsers,
      },
    },
  })),
}));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: mockResendSend } },
  FROM_ADDRESS: "hello@singjam.org",
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: mockCreateNotification,
}));

vi.mock("@/emails/set-invite", () => ({
  setCollaboratorInviteHtml: vi.fn().mockReturnValue("<p>invite</p>"),
  setCollaboratorNonMemberInviteHtml: vi.fn().mockReturnValue("<p>non-member invite</p>"),
}));
vi.mock("@/lib/shortRef", () => ({
  jamPathById: async (id: string) => `/jam/${id}`,
  setPathById: async (id: string) => `/set/${id}`,
}));

import { POST } from "./route";

// Returns a chainable Supabase query builder mock that resolves at the terminal methods.
function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "insert", "in"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.single = vi.fn().mockResolvedValue(result);
  return c;
}

function req(setId: string, body: object) {
  return new Request(`http://localhost/api/sets/${setId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const OWNER_ID = "owner-1";
const authedUser = { id: OWNER_ID };
const setRow = { id: "set-1", name: "My Set", owner_user_id: OWNER_ID };
const inviterProfile = { display_name: "Ben", username: "ben" };
const newCollab = {
  id: "collab-1",
  user_id: "user-2",
  status: "accepted",
  role: "editor",
  profiles: { display_name: "Alice", last_name: null, username: "alice", avatar_url: null },
};

// Owner inviting by user ID: sets → profiles → existing check → insert
function setupOwnerInviteByUserId({ existingCollab = null, insertResult = newCollab } = {}) {
  mockAdminFrom
    .mockReturnValueOnce(chain({ data: setRow }))
    .mockReturnValueOnce(chain({ data: inviterProfile }))
    .mockReturnValueOnce(chain({ data: existingCollab }))
    .mockReturnValueOnce(chain({ data: insertResult }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: authedUser } });
  mockResendSend.mockResolvedValue({});
  mockCreateNotification.mockResolvedValue(undefined);
  mockAdminGetUserById.mockResolvedValue({ data: { user: { email: "alice@example.com" } } });
  mockAdminListUsers.mockResolvedValue({ data: { users: [] } });
});

describe("POST /api/sets/[id]/invite", () => {
  describe("auth and validation", () => {
    it("returns 401 when not authenticated", async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      const res = await POST(req("set-1", { inviteeUserId: "user-2" }), { params: Promise.resolve({ id: "set-1" }) });
      expect(res.status).toBe(401);
    });

    it("returns 400 when neither inviteeUserId nor inviteeEmail is provided", async () => {
      const res = await POST(req("set-1", {}), { params: Promise.resolve({ id: "set-1" }) });
      expect(res.status).toBe(400);
    });

    it("returns 404 when set does not exist", async () => {
      mockAdminFrom.mockReturnValueOnce(chain({ data: null }));
      const res = await POST(req("set-1", { inviteeUserId: "user-2" }), { params: Promise.resolve({ id: "set-1" }) });
      expect(res.status).toBe(404);
    });

    it("returns 403 when caller is neither owner nor editor", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "stranger-1" } } });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))
        .mockReturnValueOnce(chain({ data: null })); // not an editor
      const res = await POST(req("set-1", { inviteeUserId: "user-2" }), { params: Promise.resolve({ id: "set-1" }) });
      expect(res.status).toBe(403);
    });
  });

  describe("inviting by user ID", () => {
    it("returns 409 when invitee is already a collaborator", async () => {
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))
        .mockReturnValueOnce(chain({ data: inviterProfile }))
        .mockReturnValueOnce(chain({ data: { id: "existing-collab" } }));
      const res = await POST(req("set-1", { inviteeUserId: "user-2" }), { params: Promise.resolve({ id: "set-1" }) });
      expect(res.status).toBe(409);
    });

    it("adds the invitee and returns the new collaborator record", async () => {
      setupOwnerInviteByUserId();
      const res = await POST(req("set-1", { inviteeUserId: "user-2", role: "editor" }), { params: Promise.resolve({ id: "set-1" }) });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.collaborator).toMatchObject({ id: "collab-1", user_id: "user-2" });
    });

    it("sends an email notification to the invitee", async () => {
      setupOwnerInviteByUserId();
      await POST(req("set-1", { inviteeUserId: "user-2" }), { params: Promise.resolve({ id: "set-1" }) });
      expect(mockResendSend).toHaveBeenCalledOnce();
      expect(mockResendSend).toHaveBeenCalledWith(expect.objectContaining({ to: "alice@example.com" }));
    });

    it("skips the email when the invitee has no email address on record", async () => {
      setupOwnerInviteByUserId();
      mockAdminGetUserById.mockResolvedValue({ data: { user: null } });
      await POST(req("set-1", { inviteeUserId: "user-2" }), { params: Promise.resolve({ id: "set-1" }) });
      expect(mockResendSend).not.toHaveBeenCalled();
    });
  });

  describe("role enforcement", () => {
    it("lets a non-owner editor collaborator invite someone as viewer", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "editor-1" } } });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))                  // sets
        .mockReturnValueOnce(chain({ data: { id: "editor-collab" } })) // editor check
        .mockReturnValueOnce(chain({ data: inviterProfile }))           // profiles
        .mockReturnValueOnce(chain({ data: null }))                     // existing check
        .mockReturnValueOnce(chain({ data: { ...newCollab, role: "viewer" } })); // insert
      const res = await POST(
        req("set-1", { inviteeUserId: "user-2", role: "viewer" }),
        { params: Promise.resolve({ id: "set-1" }) }
      );
      expect(res.status).toBe(200);
      // The insert (5th from() call) must honor the requested role: "viewer"
      const insertChain = mockAdminFrom.mock.results[4].value;
      expect(insertChain.insert).toHaveBeenCalledWith(expect.objectContaining({ role: "viewer" }));
    });

    it("rejects invites from an accepted collaborator who is only a viewer", async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: "viewer-1" } } });
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))     // sets
        .mockReturnValueOnce(chain({ data: null }));      // editor check finds no editor row
      const res = await POST(
        req("set-1", { inviteeUserId: "user-2", role: "editor" }),
        { params: Promise.resolve({ id: "set-1" }) }
      );
      expect(res.status).toBe(403);
    });
  });

  describe("inviting by email", () => {
    it("returns existingMemberId when the email matches a registered user", async () => {
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))
        .mockReturnValueOnce(chain({ data: inviterProfile }));
      mockAdminListUsers.mockResolvedValue({
        data: { users: [{ id: "user-2", email: "alice@example.com" }] },
      });
      const res = await POST(
        req("set-1", { inviteeEmail: "alice@example.com" }),
        { params: Promise.resolve({ id: "set-1" }) }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ existingMemberId: "user-2" });
    });

    it("does case-insensitive email matching for existing users", async () => {
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))
        .mockReturnValueOnce(chain({ data: inviterProfile }));
      mockAdminListUsers.mockResolvedValue({
        data: { users: [{ id: "user-2", email: "Alice@Example.com" }] },
      });
      const res = await POST(
        req("set-1", { inviteeEmail: "alice@example.com" }),
        { params: Promise.resolve({ id: "set-1" }) }
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ existingMemberId: "user-2" });
    });

    it("sends a link-based invite email to non-members", async () => {
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: setRow }))
        .mockReturnValueOnce(chain({ data: inviterProfile }))
        .mockReturnValueOnce(chain({ data: { token: "tok-abc" } })); // insert token row
      const res = await POST(
        req("set-1", { inviteeEmail: "newuser@example.com" }),
        { params: Promise.resolve({ id: "set-1" }) }
      );
      expect(res.status).toBe(200);
      expect(mockResendSend).toHaveBeenCalledOnce();
      expect(mockResendSend).toHaveBeenCalledWith(expect.objectContaining({ to: "newuser@example.com" }));
    });
  });
});
