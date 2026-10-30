import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockByToken, mockRemove, mockVisibility } = vi.hoisted(() => ({
  mockByToken: vi.fn(),
  mockRemove: vi.fn(),
  mockVisibility: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/jamLeaders", () => ({
  leaderByToken: mockByToken,
  removeJamLeader: mockRemove,
  setLeaderVisibility: mockVisibility,
}));

import { POST } from "./route";

const LEADER = { id: "leader-1", jam_id: "jam-1" };
const call = (action: string) =>
  POST(new Request("http://localhost/api/lead/tok", { method: "POST", body: JSON.stringify({ action }) }), {
    params: Promise.resolve({ token: "tok" }),
  });

beforeEach(() => vi.clearAllMocks());

describe("POST /api/lead/[token]", () => {
  it("404s an unknown or spent token", async () => {
    mockByToken.mockResolvedValue(null);
    expect((await call("withdraw")).status).toBe(404);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it("steps the leader down and tells the host", async () => {
    mockByToken.mockResolvedValue(LEADER);
    expect((await call("withdraw")).status).toBe(200);
    expect(mockRemove).toHaveBeenCalledWith({}, LEADER, { notifyHost: true });
  });

  it("hides and shows the leader on the event page", async () => {
    mockByToken.mockResolvedValue(LEADER);
    await call("hide");
    await call("show");
    expect(mockVisibility.mock.calls).toEqual([
      [{}, "leader-1", false],
      [{}, "leader-1", true],
    ]);
  });

  it("rejects anything else", async () => {
    mockByToken.mockResolvedValue(LEADER);
    expect((await call("delete-everything")).status).toBe(400);
  });
});
