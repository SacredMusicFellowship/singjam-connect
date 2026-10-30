import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetUser,
  mockBearerGetUser,
  mockAdminFrom,
  mockGetUserById,
  mockCreateNotification,
  mockSend,
  mockIsJamCohost,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockGetUserById: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockSend: vi.fn().mockResolvedValue({}),
  mockIsJamCohost: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));

vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: mockBearerGetUser } })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockAdminFrom,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));

vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: "test@singjam.org",
}));

vi.mock("@/emails/jam-invite", () => ({
  memberInviteHtml: vi.fn(() => "<html>"),
  nonMemberInviteHtml: vi.fn(() => "<html>"),
}));

vi.mock("@/lib/notifications", () => ({ createNotification: mockCreateNotification }));
vi.mock("@/lib/jamCohosts", () => ({ isJamCohost: mockIsJamCohost }));
vi.mock("@/lib/shortRef", () => ({
  jamPathById: async (id: string) => `/jam/${id}`,
  setPathById: async (id: string) => `/set/${id}`,
}));

import { POST } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "update", "insert", "limit"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

function makeReq(body: object, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/jam/jam-1/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const JAM_ID = "jam-1";
const HOST_ID = "host-1";
const INVITEE_ID = "invitee-1";
const JAM = { id: JAM_ID, name: "Leaders jam", starts_at: null, timezone: null, visibility: "private", host_user_id: HOST_ID, guests_can_invite: false };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/jam/[id]/invite", () => {
  it("returns 401 when neither cookie session nor bearer token authenticates", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ inviteeUserId: INVITEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(401);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("invites a member for a host signed in with a bearer token (the native app)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: HOST_ID } } });
    mockGetUserById.mockResolvedValue({ data: { user: { email: "invitee@example.com" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: JAM })) // jams
      .mockReturnValueOnce(chain({ data: { display_name: "Ben" } })) // inviter profile
      .mockReturnValueOnce(chain({ data: [] })) // existing invite
      .mockReturnValueOnce(chain({ data: { token: "tok-1" } })) // insert
      .mockReturnValueOnce(chain({ data: { display_name: "Scott" } })); // invitee profile

    const res = await POST(makeReq({ inviteeUserId: INVITEE_ID }, { Authorization: "Bearer tok" }), { params: Promise.resolve({ id: JAM_ID }) });

    expect(res.status).toBe(200);
    // RLS requires invited_by = the inviter; the old native path left it out and every insert failed.
    expect(mockAdminFrom.mock.results[3].value.insert).toHaveBeenCalledWith(
      expect.objectContaining({ jam_id: JAM_ID, invited_user_id: INVITEE_ID, invited_by: HOST_ID, status: "pending" })
    );
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "invitee@example.com" }));
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: INVITEE_ID, type: "jam_invite", title: "Ben invited you to Leaders jam" })
    );
  });

  it("returns 409 without re-notifying someone who already has an invite", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST_ID } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: JAM }))
      .mockReturnValueOnce(chain({ data: { display_name: "Ben" } }))
      .mockReturnValueOnce(chain({ data: [{ id: "inv-1", status: "pending" }] }));

    const res = await POST(makeReq({ inviteeUserId: INVITEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });

    expect(res.status).toBe(409);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("refuses a guest when the host has turned off guest invites", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "guest-1" } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: JAM }));

    const res = await POST(makeReq({ inviteeUserId: INVITEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });

    expect(res.status).toBe(403);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });
});
