import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetUser,
  mockBearerGetUser,
  mockAdminFrom,
  mockGetUserById,
  mockCreateNotification,
  mockSend,
  mockRsvpToJam,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockGetUserById: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockSend: vi.fn().mockResolvedValue({}),
  mockRsvpToJam: vi.fn(),
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

vi.mock("@/emails/jam-waitlist-promoted", () => ({ jamWaitlistPromotedHtml: vi.fn(() => "<html>") }));

vi.mock("@/lib/notifications", () => ({ createNotification: mockCreateNotification }));

// The RSVP rules themselves are covered in lib/jamRsvp.test.ts.
vi.mock("@/lib/jamRsvp", () => ({ rsvpToJam: mockRsvpToJam, RSVP_JAM_COLUMNS: "id" }));

import { POST, DELETE } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "in", "update", "insert", "delete", "order", "limit"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

function makeReq(method: "POST" | "DELETE", headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/jam/jam-1/rsvp", { method, headers });
}

const JAM_ID = "jam-1";
const USER_ID = "user-1";
const HOST_ID = "host-1";

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminFrom.mockReturnValue(chain({ error: null }));
});

describe("POST /api/jam/[id]/rsvp", () => {
  it("returns 401 when neither cookie session nor bearer token authenticates", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(401);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("authenticates via bearer token when there is no cookie session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID, host_user_id: HOST_ID, visibility: "community" } }));
    mockRsvpToJam.mockResolvedValue({ status: "attending", waitlistPosition: null });

    const res = await POST(makeReq("POST", { Authorization: "Bearer tok" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "attending", waitlist_position: null });
    expect(mockRsvpToJam).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: JAM_ID }), USER_ID);
  });

  // An invitee who taps RSVP instead of Accept must still leave the host's pending list.
  it("marks the caller's pending invite accepted", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID, host_user_id: HOST_ID, visibility: "private" } }));
    mockRsvpToJam.mockResolvedValue({ status: "attending", waitlistPosition: null });

    await POST(makeReq("POST"), { params: Promise.resolve({ id: JAM_ID }) });
    expect(mockAdminFrom).toHaveBeenNthCalledWith(2, "jam_invites");
    const inviteChain = mockAdminFrom.mock.results[1].value;
    expect(inviteChain.update).toHaveBeenCalledWith({ status: "accepted" });
    expect(inviteChain.eq).toHaveBeenCalledWith("invited_user_id", USER_ID);
    expect(inviteChain.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("returns the waitlist position the RSVP landed on", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID, host_user_id: HOST_ID, visibility: "community" } }));
    mockRsvpToJam.mockResolvedValue({ status: "waitlist", waitlistPosition: 3 });

    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: JAM_ID }) });
    expect(await res.json()).toEqual({ status: "waitlist", waitlist_position: 3 });
  });

  it("rejects RSVPs to official (external-ticketing) events", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { capacity: null, host_user_id: HOST_ID, name: "X", visibility: "official" } }));
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(400);
    expect(mockRsvpToJam).not.toHaveBeenCalled();
  });

  it("returns 404 for a jam that doesn't exist", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: null }));
    const res = await POST(makeReq("POST"), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(404);
    expect(mockRsvpToJam).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/jam/[id]/rsvp", () => {
  it("promotes the first waitlisted attendee when a confirmed spot opens up", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockGetUserById.mockResolvedValue({ data: { user: { email: "next@example.com" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: "r1", status: "attending" } })) // caller's rsvp
      .mockReturnValueOnce(chain({ error: null })) // cancel update
      .mockReturnValueOnce(chain({ error: null })) // cohosts delete
      .mockReturnValueOnce(chain({ data: { id: "r2", user_id: "u2" } })) // next waitlist person
      .mockReturnValueOnce(chain({ error: null })) // promote update
      .mockReturnValueOnce(chain({ data: { display_name: "Them" } })) // profile
      .mockReturnValueOnce(chain({ data: { name: "X" } })); // jam name for email

    const res = await DELETE(makeReq("DELETE"), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(200);
    const promoteChain = mockAdminFrom.mock.results[4].value;
    expect(promoteChain.update).toHaveBeenCalledWith({ status: "attending", waitlist_position: null });
  });

  it("returns 404 when the caller has no RSVP to cancel", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: null }));
    const res = await DELETE(makeReq("DELETE"), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(404);
  });
});
