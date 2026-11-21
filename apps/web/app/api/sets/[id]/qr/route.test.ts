import { describe, it, expect, vi, beforeEach } from "vitest";
import QRCode from "qrcode";

const { mockAdminFrom } = vi.hoisted(() => ({ mockAdminFrom: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));

import { GET } from "./route";

function chain(result: unknown) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  return c;
}

const get = (query = "") =>
  GET(new Request(`http://localhost/api/sets/set-1/qr${query}`), { params: Promise.resolve({ id: "set-1" }) });

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47];
const toBuffer = vi.spyOn(QRCode, "toBuffer");
const encoded = () => (toBuffer.mock.calls.at(-1) as unknown[])[0];

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SITE_URL = "https://singjam.test";
});

describe("GET /api/sets/[id]/qr", () => {
  it("returns a PNG of the set's short link", async () => {
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: "set-1", short_code: "35exb45g" } }));
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect([...new Uint8Array(await res.arrayBuffer()).slice(0, 4)]).toEqual(PNG_SIGNATURE);
    expect(encoded()).toBe("https://singjam.test/set/35exb45g");
  });

  it("encodes an invite link when the token belongs to the set", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: "set-1", short_code: "35exb45g" } }))
      .mockReturnValueOnce(chain({ data: { id: "invite-1" } }));
    const res = await get("?invite=tok-abc");
    expect(res.status).toBe(200);
    expect(encoded()).toBe("https://singjam.test/set/35exb45g?invite=tok-abc");
  });

  it("refuses a token that isn't an invite to this set", async () => {
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: "set-1", short_code: "35exb45g" } }))
      .mockReturnValueOnce(chain({ data: null }));
    expect((await get("?invite=someone-elses")).status).toBe(404);
    expect(toBuffer).not.toHaveBeenCalled();
  });

  it("returns 404 for a set that doesn't exist", async () => {
    mockAdminFrom.mockReturnValueOnce(chain({ data: null }));
    expect((await get()).status).toBe(404);
  });
});
