import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockResolveUser, mockAdminFrom, mockRpc } = vi.hoisted(() => ({
  mockResolveUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock("@/lib/supabase/apiUser", () => ({ resolveApiUser: mockResolveUser }));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom, rpc: mockRpc })),
}));

import { PATCH } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  return c;
}

function req(body: object) {
  return new Request("http://localhost/api/sets/set-1/songs/reorder", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: "set-1" }) };
const order = [{ id: "a", position: 0 }, { id: "b", position: 1 }];

function access(owner: boolean, coOwner: boolean) {
  mockAdminFrom.mockImplementation((table: string) =>
    table === "sets"
      ? chain({ data: owner ? { id: "set-1" } : null })
      : chain({ data: coOwner ? { id: "c-1" } : null })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveUser.mockResolvedValue({ id: "user-1" });
  mockRpc.mockResolvedValue({ error: null });
});

describe("PATCH /api/sets/[id]/songs/reorder", () => {
  it("returns 401 when signed out", async () => {
    mockResolveUser.mockResolvedValue(null);
    expect((await PATCH(req({ order }), params)).status).toBe(401);
  });

  it("refuses editors and viewers", async () => {
    access(false, false);
    expect((await PATCH(req({ order }), params)).status).toBe(403);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("saves the whole order in one call so two reorders can't interleave", async () => {
    access(false, true);
    const res = await PATCH(req({ order: [...order.map((o) => ({ ...o, extra: 1 }))] }), params);
    expect(res.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith("reorder_set_songs", { p_set_id: "set-1", p_order: order });
  });

  it("reports a failed save instead of claiming success", async () => {
    access(true, false);
    mockRpc.mockResolvedValue({ error: { message: "boom" } });
    expect((await PATCH(req({ order }), params)).status).toBe(500);
  });
});
