import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockByToken, mockRemove } = vi.hoisted(() => ({
  mockByToken: vi.fn(),
  mockRemove: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn(() => ({})) }));
vi.mock("@/lib/jamLeaders", () => ({
  leaderByToken: mockByToken,
  removeJamLeader: mockRemove,
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

  it("rejects anything else", async () => {
    mockByToken.mockResolvedValue(LEADER);
    expect((await call("hide")).status).toBe(400);
  });
});
