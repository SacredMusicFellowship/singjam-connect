import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockAdminFrom, mockCanManage, mockCouponRetrieve, mockCreatePromo } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockCanManage: vi.fn(),
  mockCouponRetrieve: vi.fn(),
  mockCreatePromo: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/supabase/bearer", () => ({ supabaseFromBearer: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })) }));
vi.mock("@/lib/jamAuthz", () => ({ canManageJam: mockCanManage }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ coupons: { retrieve: mockCouponRetrieve } }) }));
vi.mock("@/lib/ticketPromoCodes", () => ({ createPromoCode: mockCreatePromo }));

import { POST } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "insert", "update", "order", "limit"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const NEW = "jam-nov";
const OLD = "jam-oct";
const LA = "America/Los_Angeles";
const params = { params: Promise.resolve({ id: NEW }) };
const req = (body: any) =>
  new Request(`http://localhost/api/jam/${NEW}/tickets/copy`, { method: "POST", body: JSON.stringify(body) });

const target = { starts_at: "2026-11-01T22:30:00.000Z", timezone: LA, visibility: "official" };
const source = { starts_at: "2026-10-04T21:30:00+00:00", timezone: LA, visibility: "official" };

// Admin lookups in the order the route makes them.
function setup({
  existing = [] as any[],
  tiers = [] as any[],
  promos = [] as any[],
  tgt = target,
  src = source as Record<string, unknown>,
  limitUpdate = chain({ error: null }),
} = {}) {
  const insert = chain({ error: null });
  mockAdminFrom
    .mockReturnValueOnce(chain({ data: tgt }))
    .mockReturnValueOnce(chain({ data: src }))
    .mockReturnValueOnce(chain({ data: existing }))
    .mockReturnValueOnce(chain({ data: tiers }));
  if (tiers.length > 0) mockAdminFrom.mockReturnValueOnce(insert);
  if (src.ticket_limit) mockAdminFrom.mockReturnValueOnce(limitUpdate);
  mockAdminFrom.mockReturnValueOnce(chain({ data: promos }));
  return insert;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminFrom.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "host-1" } } });
  mockCanManage.mockResolvedValue(true);
});

describe("POST /api/jam/[id]/tickets/copy", () => {
  it("copies tiers with sales windows moved to the new date", async () => {
    const insert = setup({
      tiers: [
        { name: "Advance", description: null, price_cents: 1500, currency: "usd", quantity: null,
          sales_start_at: null, sales_end_at: "2026-10-04T06:59:59.000Z", sort_order: 0 },
      ],
    });
    const res = await POST(req({ from: OLD }), params);
    expect(res.status).toBe(200);
    expect(insert.insert).toHaveBeenCalledWith([
      expect.objectContaining({
        jam_id: NEW,
        name: "Advance",
        price_cents: 1500,
        sales_start_at: null,
        sales_end_at: "2026-11-01T06:59:59.000Z",
      }),
    ]);
  });

  it("carries the event's total ticket limit over", async () => {
    const limitUpdate = chain({ error: null });
    setup({ src: { ...source, ticket_limit: 100 }, limitUpdate });
    const res = await POST(req({ from: OLD }), params);
    expect(res.status).toBe(200);
    expect(limitUpdate.update).toHaveBeenCalledWith({ ticket_limit: 100 });
    expect(limitUpdate.eq).toHaveBeenCalledWith("id", NEW);
  });

  it("recreates promo codes with the new event's date suffix and the same discount", async () => {
    setup({ promos: [{ code: "TEAMOCT426", stripe_coupon_id: "co_1" }] });
    mockCouponRetrieve.mockResolvedValue({ percent_off: 100, amount_off: null });
    mockCreatePromo.mockResolvedValue({ ok: true, row: { id: "p", code: "TEAMNOV126", label: "100% off" } });

    const res = await POST(req({ from: OLD }), params);
    expect(await res.json()).toEqual({ tiers: 0, promo_codes: ["TEAMNOV126"], skipped: [] });
    expect(mockCreatePromo).toHaveBeenCalledWith(expect.anything(), {
      jamId: NEW, code: "TEAMNOV126", discount: { percentOff: 100 }, userId: "host-1",
    });
  });

  it("reports a code that couldn't be created instead of failing the copy", async () => {
    setup({ promos: [{ code: "TEAMOCT426", stripe_coupon_id: "co_1" }] });
    mockCouponRetrieve.mockResolvedValue({ percent_off: null, amount_off: 500 });
    mockCreatePromo.mockResolvedValue({ ok: false, status: 409, error: "That code is already used by another event" });

    const body = await (await POST(req({ from: OLD }), params)).json();
    expect(body.skipped).toEqual([{ code: "TEAMNOV126", reason: "That code is already used by another event" }]);
  });

  it("refuses to copy onto an event that already has tiers", async () => {
    setup({ existing: [{ id: "t" }] });
    expect((await POST(req({ from: OLD }), params)).status).toBe(409);
  });

  it("refuses when the caller can't manage the source event", async () => {
    setup();
    mockCanManage.mockImplementation(async (_a: any, id: string) => id === NEW);
    expect((await POST(req({ from: OLD }), params)).status).toBe(403);
  });

  it("refuses a non-official copy", async () => {
    setup({ tgt: { ...target, visibility: "community" } });
    expect((await POST(req({ from: OLD }), params)).status).toBe(400);
  });
});
