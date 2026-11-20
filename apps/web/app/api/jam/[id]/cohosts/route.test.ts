import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockAdminFrom, mockCreateNotification } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockCreateNotification: vi.fn(),
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

import { POST, DELETE } from "./route";

function chain(result: any, extra: Record<string, any> = {}) {
  const c: any = {};
  for (const m of ["select", "eq", "insert", "delete"]) c[m] = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  Object.assign(c, extra);
  return c;
}

function makeReq(method: "POST" | "DELETE", jamId: string, body: object) {
  return new Request(`http://localhost/api/jam/${jamId}/cohosts`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const HOST_ID = "host-1";
const JAM_ID = "jam-1";
const ATTENDEE_ID = "attendee-1";
const jamRow = { host_user_id: HOST_ID, name: "Test Jam" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetUser.mockResolvedValue({ data: { user: { id: HOST_ID } } });
});

describe("POST /api/jam/[id]/cohosts", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq("POST", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 400 when userId is missing", async () => {
    const res = await POST(makeReq("POST", JAM_ID, {}), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the jam does not exist", async () => {
    mockAdminFrom.mockReturnValueOnce(chain({ data: null }));
    const res = await POST(makeReq("POST", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is not the host", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "stranger" } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: jamRow }));
    const res = await POST(makeReq("POST", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 when the target user is not an attending RSVP", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: jamRow }))
      .mockReturnValueOnce(chain({ data: { status: "waitlist" } }));
    const res = await POST(makeReq("POST", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(400);
  });

  it("promotes an attending user to co-host and notifies them", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: jamRow }))
      .mockReturnValueOnce(chain({ data: { status: "attending" } }))
      .mockReturnValueOnce(chain({ error: null }));

    const res = await POST(makeReq("POST", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });

    expect(res.status).toBe(200);
    const insertChain = mockAdminFrom.mock.results[2].value;
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ jam_id: JAM_ID, user_id: ATTENDEE_ID, added_by: HOST_ID })
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ATTENDEE_ID, type: "jam_cohost_added" })
    );
  });

  it("refuses co-hosts on an official event, even from its creator", async () => {
    mockAdminFrom.mockReturnValueOnce(chain({ data: { ...jamRow, visibility: "official" } }));
    const res = await POST(makeReq("POST", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(400);
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/jam/[id]/cohosts", () => {
  it("returns 401 when not authenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(makeReq("DELETE", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller is not the host", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "stranger" } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: jamRow }));
    const res = await DELETE(makeReq("DELETE", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(403);
  });

  it("removes the co-host", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: jamRow }))
      .mockReturnValueOnce(chain({ error: null }));
    const res = await DELETE(makeReq("DELETE", JAM_ID, { userId: ATTENDEE_ID }), { params: Promise.resolve({ id: JAM_ID }) });
    expect(res.status).toBe(200);
  });
});
