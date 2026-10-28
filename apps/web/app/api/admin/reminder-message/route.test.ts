import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockAdminFrom } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAdminFrom: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })) }));

import { NextResponse } from "next/server";
import { GET, PUT } from "./route";
import { DEFAULT_REMINDER_MESSAGE, REMINDER_MESSAGE_MAX_LENGTH } from "@/lib/reminderMessage";

const put = (body: unknown) =>
  PUT(new Request("http://localhost/api/admin/reminder-message", { method: "PUT", body: JSON.stringify(body) }));

let upsert: ReturnType<typeof vi.fn>;
let deleteEq: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
  upsert = vi.fn().mockResolvedValue({ error: null });
  deleteEq = vi.fn().mockResolvedValue({ error: null });
  mockAdminFrom.mockReturnValue({
    upsert,
    delete: () => ({ eq: deleteEq }),
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: "Saved {name}" } }) }) }),
  });
});

describe("reminder-message route", () => {
  it("rejects non-admins", async () => {
    const denied = NextResponse.json({ error: "Forbidden" }, { status: 403 });
    mockRequireAdmin.mockResolvedValue({ ok: false, response: denied });
    expect((await put({ message: "x" })).status).toBe(403);
    expect((await GET()).status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("returns the saved message and the default", async () => {
    expect(await (await GET()).json()).toEqual({ message: "Saved {name}", defaultMessage: DEFAULT_REMINDER_MESSAGE });
  });

  it("saves a custom message", async () => {
    const res = await put({ message: "  Hi {name}!  " });
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: "event_reminder_message", value: "Hi {name}!", updated_by: "admin-1" }),
      { onConflict: "key" }
    );
  });

  it("removes the saved row when reset to the default or emptied", async () => {
    await put({ message: DEFAULT_REMINDER_MESSAGE });
    await put({ message: "   " });
    expect(deleteEq).toHaveBeenCalledTimes(2);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a message that isn't a string or is too long", async () => {
    expect((await put({ message: 42 })).status).toBe(400);
    expect((await put({ message: "x".repeat(REMINDER_MESSAGE_MAX_LENGTH + 1) })).status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});
