import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockAdminFrom, mockCanManage, mockRetrieve } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockCanManage: vi.fn(),
  mockRetrieve: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })),
}));
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })) }));
vi.mock("@/lib/jamAuthz", () => ({ canManageJam: mockCanManage }));
vi.mock("@/lib/stripe", () => ({ stripe: () => ({ promotionCodes: { retrieve: mockRetrieve } }) }));
vi.mock("@/lib/ticketPromoCodes", () => ({ createPromoCode: vi.fn() }));

import { GET } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "order"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const params = { params: Promise.resolve({ id: "jam-1" }) };
const req = () => new Request("http://localhost/api/jam/jam-1/tickets/promos");
const CODE = { id: "pc-1", code: "NOV1", label: "100% off", stripe_promotion_code_id: "promo_1" };

function db(freeCount: { count: number | null; error?: any }) {
  mockAdminFrom
    .mockReturnValueOnce(chain({ data: { host_user_id: "host-1" } })) // jam
    .mockReturnValueOnce(chain({ data: [CODE] })) // codes
    .mockReturnValueOnce(chain(freeCount)); // free orders count
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminFrom.mockReset();
  mockGetUser.mockResolvedValue({ data: { user: { id: "host-1" } } });
  mockCanManage.mockResolvedValue(true);
});

describe("GET promo codes", () => {
  it("counts uses that made the order free on top of Stripe's count", async () => {
    // The Nov 1 bug: two people used a code that made their tickets free, and
    // Stripe — which never saw those orders — reported 0.
    db({ count: 2 });
    mockRetrieve.mockResolvedValue({ times_redeemed: 0 });
    const json = await (await GET(req(), params)).json();
    expect(json.promo_codes[0]).toMatchObject({ code: "NOV1", redeemed: 2 });
  });

  it("adds Stripe's charged uses and the free ones", async () => {
    db({ count: 1 });
    mockRetrieve.mockResolvedValue({ times_redeemed: 3 });
    expect((await (await GET(req(), params)).json()).promo_codes[0].redeemed).toBe(4);
  });

  it("falls back to Stripe's count when free uses can't be counted", async () => {
    db({ count: null, error: { message: "column ticket_orders.promo_code_id does not exist" } });
    mockRetrieve.mockResolvedValue({ times_redeemed: 3 });
    expect((await (await GET(req(), params)).json()).promo_codes[0].redeemed).toBe(3);
  });

  it("shows free uses even when the code is gone from Stripe", async () => {
    db({ count: 2 });
    mockRetrieve.mockRejectedValue(new Error("No such promotion code"));
    expect((await (await GET(req(), params)).json()).promo_codes[0].redeemed).toBe(2);
  });
});
