import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockAdminFrom, mockCreateNotification, mockRsvpToJam } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockCreateNotification: vi.fn(),
  mockRsvpToJam: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({
    auth: { getUser: mockGetUser },
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));

vi.mock("@/lib/notifications", () => ({
  createNotification: mockCreateNotification,
}));

// The RSVP rules themselves are covered in lib/jamRsvp.test.ts.
vi.mock("@/lib/jamRsvp", () => ({ rsvpToJam: mockRsvpToJam, RSVP_JAM_COLUMNS: "id" }));

import { POST } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "neq", "update", "insert"]) c[m] = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

function makeReq(body: object) {
  return new Request("http://localhost/api/jam/jam-1/invite/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const JAM_ID = "jam-1";
const HOST_ID = "host-1";
const INVITE_ROW = { id: "invite-1", status: "pending", invited_by: "someone-else" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/jam/[id]/invite/respond", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ response: "accepted" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 for an invalid response value", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    const res = await POST(makeReq({ response: "maybe" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when there is no matching invite", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: null }));
    const res = await POST(makeReq({ response: "accepted" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(404);
  });

  it("rejects acceptance when the caller is the jam's own host, even if a stray invite row points at them", async () => {
    // Guards the case where /api/invite/claim (or bad data) left invited_user_id = the host.
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST_ID } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: INVITE_ROW })) // jam_invites select
      .mockReturnValueOnce(chain({ data: [{ id: "invite-1" }] })) // jam_invites status update
      .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Test Jam", host_user_id: HOST_ID } })); // jams select

    const res = await POST(makeReq({ response: "accepted" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(400);
    expect(mockRsvpToJam).not.toHaveBeenCalled();
  });

  it("RSVPs an invitee who accepts and tells a separate inviter", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "invitee-1" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: INVITE_ROW })) // jam_invites select
      .mockReturnValueOnce(chain({ data: [{ id: "invite-1" }] })) // jam_invites status update
      .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Test Jam", host_user_id: HOST_ID } })) // jams select
      .mockReturnValueOnce(chain({ data: { display_name: "Invitee" } })); // profile lookup
    mockRsvpToJam.mockResolvedValue({ status: "attending", waitlistPosition: null });

    const res = await POST(makeReq({ response: "accepted" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rsvpStatus: "attending" });
    expect(mockRsvpToJam).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: JAM_ID }), "invitee-1");
    // The host hears through rsvpToJam; the route itself only tells the inviter.
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "someone-else", type: "invite_accepted" })
    );
  });

  it("reports the waitlist when accepting a full jam", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "invitee-1" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { ...INVITE_ROW, invited_by: HOST_ID } }))
      .mockReturnValueOnce(chain({ data: [{ id: "invite-1" }] }))
      .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Test Jam", host_user_id: HOST_ID } }));
    mockRsvpToJam.mockResolvedValue({ status: "waitlist", waitlistPosition: 2 });

    const res = await POST(makeReq({ response: "accepted" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(await res.json()).toEqual({ ok: true, rsvpStatus: "waitlist" });
  });

  it("tells nobody when an already-accepted invite is accepted again", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "invitee-1" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { ...INVITE_ROW, status: "accepted" } }))
      .mockReturnValueOnce(chain({ data: [] })) // conditional update matched nothing
      .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Test Jam", host_user_id: HOST_ID } }));
    mockRsvpToJam.mockResolvedValue({ status: "attending", waitlistPosition: null });

    const res = await POST(makeReq({ response: "accepted" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(200);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("tells the inviter about a decline once, not on a repeat", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "invitee-1" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: INVITE_ROW }))
      .mockReturnValueOnce(chain({ data: [{ id: "invite-1" }] }))
      .mockReturnValueOnce(chain({ data: { display_name: "Invitee" } }))
      .mockReturnValueOnce(chain({ data: { name: "Test Jam" } }));
    await POST(makeReq({ response: "declined" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "someone-else", type: "invite_declined" })
    );

    mockCreateNotification.mockClear();
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { ...INVITE_ROW, status: "declined" } }))
      .mockReturnValueOnce(chain({ data: [] }));
    await POST(makeReq({ response: "declined" }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockRsvpToJam).not.toHaveBeenCalled();
  });
});
