import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockUser, mockCanManage, mockBlocked, mockAdd, mockRows, mockDescribe, mockRemove } = vi.hoisted(() => ({
  mockUser: vi.fn(),
  mockCanManage: vi.fn(),
  mockBlocked: vi.fn(),
  mockAdd: vi.fn(),
  mockRows: vi.fn(),
  mockDescribe: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/supabase/apiUser", () => ({ resolveApiUser: mockUser }));
vi.mock("@/lib/jamAuthz", () => ({ canManageJam: mockCanManage }));
vi.mock("@/lib/devSafety", () => ({ ticketingBlocked: mockBlocked }));
vi.mock("@/lib/jamLeaders", () => ({
  publicLeaders: (ls: any[]) =>
    ls.filter((l) => l.show_publicly).map(({ id, user_id, name, username, avatar_url }) => ({ id, user_id, name, username, avatar_url })),
  addJamLeader: mockAdd,
  jamLeaderRows: mockRows,
  describeLeaders: mockDescribe,
  removeJamLeader: mockRemove,
}));

import { GET, POST, DELETE } from "./route";

const params = { params: Promise.resolve({ id: "jam-1" }) };
const req = (method: string, body?: object) =>
  new Request("http://localhost/api/jam/jam-1/leaders", { method, body: body ? JSON.stringify(body) : undefined });

const ROW = { id: "leader-1", jam_id: "jam-1", user_id: "member-1", token: "tok", show_publicly: true };
const DESCRIBED = { id: "leader-1", user_id: "member-1", name: "Maria", username: "maria", avatar_url: null, email: null, show_publicly: true };

beforeEach(() => {
  vi.clearAllMocks();
  mockBlocked.mockReturnValue(false);
  mockRows.mockResolvedValue([ROW]);
  mockDescribe.mockResolvedValue([DESCRIBED]);
});

describe("GET /api/jam/[id]/leaders", () => {
  it("shows anyone the public list, with no token or management data", async () => {
    mockUser.mockResolvedValue(null);
    const body = await (await GET(req("GET"), params)).json();
    expect(body.leaders).toEqual([{ id: "leader-1", user_id: "member-1", name: "Maria", username: "maria", avatar_url: null }]);
    expect(body.me).toBeNull();
    expect(body).not.toHaveProperty("managed");
  });

  it("gives a leader their own token so they can step down", async () => {
    mockUser.mockResolvedValue({ id: "member-1" });
    mockCanManage.mockResolvedValue(false);
    const body = await (await GET(req("GET"), params)).json();
    expect(body.me).toEqual({ token: "tok" });
  });

  it("never gives one leader's token to another viewer", async () => {
    mockUser.mockResolvedValue({ id: "someone-else" });
    mockCanManage.mockResolvedValue(false);
    const body = await (await GET(req("GET"), params)).json();
    expect(body.me).toBeNull();
  });
});

describe("POST /api/jam/[id]/leaders", () => {
  it("requires sign-in", async () => {
    mockUser.mockResolvedValue(null);
    expect((await POST(req("POST", { userId: "m" }), params)).status).toBe(401);
  });

  it("is refused to anyone who can't manage the event", async () => {
    mockUser.mockResolvedValue({ id: "member-2" });
    mockCanManage.mockResolvedValue(false);
    expect((await POST(req("POST", { userId: "m" }), params)).status).toBe(403);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("is refused under next dev, where every official event is a live one", async () => {
    mockUser.mockResolvedValue({ id: "host-1" });
    mockCanManage.mockResolvedValue(true);
    mockBlocked.mockReturnValue(true);
    expect((await POST(req("POST", { userId: "m" }), params)).status).toBe(403);
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it("adds the leader for a manager", async () => {
    mockUser.mockResolvedValue({ id: "host-1" });
    mockCanManage.mockResolvedValue(true);
    mockAdd.mockResolvedValue({ ok: true, leader: DESCRIBED, emailed: true });
    const res = await POST(req("POST", { userId: "member-1" }), params);
    expect(res.status).toBe(200);
    expect(mockAdd).toHaveBeenCalledWith({}, expect.objectContaining({ jamId: "jam-1", addedBy: "host-1", userId: "member-1" }));
  });
});

describe("DELETE /api/jam/[id]/leaders", () => {
  it("only removes a leader of this event", async () => {
    mockUser.mockResolvedValue({ id: "host-1" });
    mockCanManage.mockResolvedValue(true);
    expect((await DELETE(req("DELETE", { leaderId: "leader-from-another-jam" }), params)).status).toBe(404);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("removes quietly — the host did it, so nobody needs telling", async () => {
    mockUser.mockResolvedValue({ id: "host-1" });
    mockCanManage.mockResolvedValue(true);
    expect((await DELETE(req("DELETE", { leaderId: "leader-1" }), params)).status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith({}, ROW, { notifyHost: false });
  });
});
