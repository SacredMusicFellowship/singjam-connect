import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const { mockGetUser, mockAdminGetUser, mockDeleteUser, mockDeleteContact, attendanceDeletes } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminGetUser: vi.fn(),
  mockDeleteUser: vi.fn(),
  mockDeleteContact: vi.fn(),
  attendanceDeletes: [] as { table: string; col: string; value: string }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
  })),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({
    auth: { getUser: mockAdminGetUser, admin: { deleteUser: mockDeleteUser } },
    from: (table: string) => ({
      delete: () => ({
        eq: async (col: string, value: string) => {
          attendanceDeletes.push({ table, col, value });
          return { error: null };
        },
      }),
    }),
  })),
}));

vi.mock("@/lib/activecampaign", () => ({ deleteContact: mockDeleteContact }));

import { DELETE } from "./route";

function req(headers?: Record<string, string>) {
  return new Request("https://singjam.org/api/account/delete", { method: "DELETE", headers }) as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  attendanceDeletes.length = 0;
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "Singer@Example.com" } } });
  mockAdminGetUser.mockResolvedValue({ data: { user: null } });
  mockDeleteContact.mockResolvedValue(true);
  mockDeleteUser.mockResolvedValue({ error: null });
});

describe("DELETE /api/account/delete", () => {
  it("returns 401 when there's no authenticated user", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await DELETE(req());
    expect(res.status).toBe(401);
    expect(mockDeleteUser).not.toHaveBeenCalled();
  });

  it("deletes the ActiveCampaign contact and the Supabase user", async () => {
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(mockDeleteContact).toHaveBeenCalledWith("Singer@Example.com");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
  });

  it("deletes their event attendance by account and by email, so no history is left behind", async () => {
    await DELETE(req());
    expect(attendanceDeletes).toEqual([
      { table: "event_attendance", col: "user_id", value: "user-1" },
      { table: "event_attendance", col: "email", value: "singer@example.com" },
    ]);
  });

  it("still deletes the Supabase user when the ActiveCampaign cleanup fails", async () => {
    mockDeleteContact.mockRejectedValue(new Error("AC is down"));
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
  });

  it("authenticates via a Bearer token when there's no cookie session (native clients)", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockAdminGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "singer@example.com" } } });
    const res = await DELETE(req({ Authorization: "Bearer good-token" }));
    expect(res.status).toBe(200);
    expect(mockAdminGetUser).toHaveBeenCalledWith("good-token");
    expect(mockDeleteUser).toHaveBeenCalledWith("user-1");
  });

  it("returns 500 when Supabase user deletion fails", async () => {
    mockDeleteUser.mockResolvedValue({ error: { message: "boom" } });
    const res = await DELETE(req());
    expect(res.status).toBe(500);
  });
});
