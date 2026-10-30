import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFrom, mockEq } = vi.hoisted(() => ({ mockFrom: vi.fn(), mockEq: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: () => ({ from: mockFrom }) }));
vi.mock("react", () => ({ cache: (fn: any) => fn }));

import { resolveJamId } from "./jamRef";

function lookupReturns(row: unknown) {
  const c: any = { select: () => c, eq: (...args: unknown[]) => { mockEq(...args); return c; } };
  c.maybeSingle = () => Promise.resolve({ data: row });
  mockFrom.mockReturnValue(c);
}

beforeEach(() => vi.clearAllMocks());

describe("resolveJamId", () => {
  it("passes an old uuid link straight through without a lookup", async () => {
    const uuid = "ad5fef0a-dfcb-42c2-86e4-04e3030b0164";
    expect(await resolveJamId(uuid)).toBe(uuid);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("looks a short code up, ignoring case", async () => {
    lookupReturns({ id: "jam-uuid" });
    expect(await resolveJamId("K3X9P2MQ")).toBe("jam-uuid");
    expect(mockEq).toHaveBeenCalledWith("short_code", "k3x9p2mq");
  });

  it("returns null for a code that matches nothing", async () => {
    lookupReturns(null);
    expect(await resolveJamId("nope2345")).toBeNull();
  });
});
