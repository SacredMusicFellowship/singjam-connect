import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireRole, mockRevalidatePath } = vi.hoisted(() => ({
  mockRequireRole: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireRole: mockRequireRole }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));

import { POST } from "./route";

describe("POST /api/songs/revalidate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only lets admins and song editors clear the cache", async () => {
    mockRequireRole.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });

    const res = await POST();

    expect(mockRequireRole).toHaveBeenCalledWith("admin", "song_editor");
    expect(res.status).toBe(403);
    expect(mockRevalidatePath).not.toHaveBeenCalled();
  });

  it("clears every cached page so browse pages show the saved song", async () => {
    mockRequireRole.mockResolvedValue({ ok: true });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});
