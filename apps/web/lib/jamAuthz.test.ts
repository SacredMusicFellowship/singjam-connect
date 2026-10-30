import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockIsCohost } = vi.hoisted(() => ({ mockIsCohost: vi.fn() }));
vi.mock("@/lib/jamCohosts", () => ({ isJamCohost: mockIsCohost }));

import { canManageJam, canEditJamById } from "./jamAuthz";

function admin(jam: any, profile: any = null) {
  const chain = (result: any) => {
    const c: any = {};
    for (const m of ["select", "eq"]) c[m] = vi.fn().mockReturnValue(c);
    c.maybeSingle = vi.fn().mockResolvedValue(result);
    return c;
  };
  return {
    from: vi.fn((t: string) => (t === "jams" ? chain({ data: jam }) : chain({ data: profile }))),
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsCohost.mockResolvedValue(false);
});

describe("canManageJam", () => {
  it("lets the host manage their own jam", async () => {
    expect(await canManageJam(admin({ host_user_id: "u1", visibility: "community" }), "j", "u1")).toBe(true);
  });

  it("lets a co-host manage", async () => {
    mockIsCohost.mockResolvedValue(true);
    expect(await canManageJam(admin({ host_user_id: "other", visibility: "community" }), "j", "u1")).toBe(true);
  });

  it("lets an official host manage an official event they did not create", async () => {
    // The whole point: an official event is the org's, not one account's.
    const a = admin({ host_user_id: "someone-else", visibility: "official" }, { can_host_official: true });
    expect(await canManageJam(a, "j", "u1")).toBe(true);
  });

  it("does NOT let an official host manage somebody's community jam", async () => {
    // The capability is about SingJam's own events, not a master key.
    const a = admin({ host_user_id: "someone-else", visibility: "community" }, { can_host_official: true });
    expect(await canManageJam(a, "j", "u1")).toBe(false);
  });

  it("does NOT let a private jam be managed by an official host", async () => {
    const a = admin({ host_user_id: "someone-else", visibility: "private" }, { can_host_official: true });
    expect(await canManageJam(a, "j", "u1")).toBe(false);
  });

  it("refuses a plain member on an official event", async () => {
    const a = admin({ host_user_id: "someone-else", visibility: "official" }, { can_host_official: false });
    expect(await canManageJam(a, "j", "u1")).toBe(false);
  });

  it("refuses when the profile row is missing entirely", async () => {
    const a = admin({ host_user_id: "someone-else", visibility: "official" }, null);
    expect(await canManageJam(a, "j", "u1")).toBe(false);
  });

  it("refuses when the jam does not exist", async () => {
    expect(await canManageJam(admin(null), "j", "u1")).toBe(false);
  });
});

describe("canEditJamById", () => {
  it("lets the host edit their own jam", async () => {
    expect(await canEditJamById(admin({ host_user_id: "u1", visibility: "community" }), "j", "u1")).toBe(true);
  });

  it("lets an official host edit an official event they did not create", async () => {
    const a = admin({ host_user_id: "someone-else", visibility: "official" }, { can_host_official: true });
    expect(await canEditJamById(a, "j", "u1")).toBe(true);
  });

  it("does NOT let a co-host edit or cancel, even though they can manage", async () => {
    mockIsCohost.mockResolvedValue(true);
    const a = admin({ host_user_id: "other", visibility: "community" }, { can_host_official: false });
    expect(await canManageJam(a, "j", "u1")).toBe(true);
    expect(await canEditJamById(a, "j", "u1")).toBe(false);
  });

  it("does NOT let an official host edit somebody's community jam", async () => {
    const a = admin({ host_user_id: "someone-else", visibility: "community" }, { can_host_official: true });
    expect(await canEditJamById(a, "j", "u1")).toBe(false);
  });

  it("refuses when the jam does not exist", async () => {
    expect(await canEditJamById(admin(null), "j", "u1")).toBe(false);
  });
});
