import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const {
  mockGetUser, mockBearerGetUser, mockAdminFrom, mockRpc, mockSessionsCreate,
  mockResolvePromo, mockFulfil,
} = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockSessionsCreate: vi.fn(),
  mockResolvePromo: vi.fn(),
  mockFulfil: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: mockBearerGetUser } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom, rpc: mockRpc })),
}));
vi.mock("@/lib/stripe", () => ({
  // A factory, matching the lazy client in lib/stripe.ts.
  stripe: () => ({ checkout: { sessions: { create: mockSessionsCreate } } }),
  SITE_URL: "https://singjam.org",
  TICKET_INTEGRATION_ID: "singjam_tickets_qxwmvpht",
  SESSION_EXPIRY_MINUTES: 30,
  HOLD_MINUTES: 35,
  EXCLUDED_PAYMENT_METHODS: ["klarna", "affirm", "afterpay_clearpay"],
  TICKET_PM_CONFIG: "pmc_test_cfg",
}));

vi.mock("@/lib/promoCode", () => ({ resolvePromoCode: mockResolvePromo }));
vi.mock("@/lib/ticketFulfilment", () => ({ fulfilPendingOrder: mockFulfil }));

import { POST } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "in", "ilike", "update", "insert", "order", "limit"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const JAM_ID = "jam-1";
const USER_ID = "user-1";
const ORDER_ID = "order-1";
const TYPE_ID = "type-1";

function makeReq(body: any, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/jam/${JAM_ID}/tickets/checkout`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: JAM_ID }) };
const ONE_TICKET = { items: [{ ticket_type_id: TYPE_ID, quantity: 1 }] };

// Queues the admin.from() chain in call order. `promo` inserts the
// ticket_promo_codes lookup where the route actually makes it — between the
// tickets select and the final ticket_orders update — because these are
// mockReturnValueOnce queues and order matters.
function happyPathDb() {
  mockAdminFrom
    .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Winter Sing", visibility: "official" } }))
    .mockReturnValueOnce(chain({ data: { id: ORDER_ID, amount_cents: 3000, currency: "usd" } }))
    .mockReturnValueOnce(
      chain({
        data: [
          { ticket_type_id: TYPE_ID, ticket_types: { name: "General", price_cents: 1500, currency: "usd" } },
          { ticket_type_id: TYPE_ID, ticket_types: { name: "General", price_cents: 1500, currency: "usd" } },
        ],
      })
    );
  mockAdminFrom.mockReturnValueOnce(chain({ error: null })); // update or releaseHold
  mockRpc.mockResolvedValue({ data: ORDER_ID, error: null });
}

// Index of the trailing ticket_orders chain. Promo resolution no longer touches
// the admin client — it lives behind resolvePromoCode — so this is fixed now.
const TRAILING = 3;

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks does NOT drain mockReturnValueOnce queues, and paths through
  // this route consume different numbers of chains — the free-ticket path
  // returns before the trailing update. Without a reset, one test's unused
  // chain becomes the next test's "jam" lookup and it 404s for no visible
  // reason.
  mockAdminFrom.mockReset();
  mockRpc.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/jam/[id]/tickets/checkout", () => {
  it("previews the payment page under next dev, with no order, hold or Stripe session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "");
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "a@b.com" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Winter Sing", visibility: "official" } }))
      .mockReturnValueOnce(chain({ data: [{ id: TYPE_ID, name: "General", price_cents: 1500, currency: "usd" }] }));

    const res = await POST(makeReq({ items: [{ ticket_type_id: TYPE_ID, quantity: 2 }], cover_fees: true }), params);

    expect(res.status).toBe(200);
    expect((await res.json()).preview_url).toBe(`/jam/${JAM_ID}/tickets/pay?preview=${TYPE_ID}%3A2&cover=1`);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    expect(mockFulfil).not.toHaveBeenCalled();
  });

  it("sends a free order under next dev straight to the confirmation preview, reserving nothing", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "");
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "a@b.com" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Winter Sing", visibility: "official" } }))
      .mockReturnValueOnce(chain({ data: [{ id: TYPE_ID, name: "General", price_cents: 1500, currency: "usd" }] }));
    mockResolvePromo.mockResolvedValue({
      valid: true, code: "COMP100", label: "100% off", promoCodeId: "pc-free",
      promotionCodeId: "promo_free", discountCents: 1500, totalCents: 0,
    });

    const res = await POST(makeReq({ ...ONE_TICKET, promo_code: "COMP100" }), params);

    expect(res.status).toBe(200);
    expect((await res.json()).preview_url).toBe(`/jam/${JAM_ID}/tickets/complete?preview=${TYPE_ID}%3A1&promo=COMP100`);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockFulfil).not.toHaveBeenCalled();
  });

  it("never reserves under next dev, even with ALLOW_DEV_SIDE_EFFECTS=true", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ALLOW_DEV_SIDE_EFFECTS", "true");
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "a@b.com" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "Winter Sing", visibility: "official" } }))
      .mockReturnValueOnce(chain({ data: [{ id: TYPE_ID, name: "General", price_cents: 1500, currency: "usd" }] }));

    const res = await POST(makeReq(ONE_TICKET), params);

    expect((await res.json()).preview_url).toMatch(/\/tickets\/pay\?/);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("rejects an anonymous buyer with no email, rather than 401ing them", async () => {
    // Guest checkout is allowed, so the gate is a usable email, not an account.
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq(ONE_TICKET), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/email/i);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed guest email before reserving stock", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeReq({ ...ONE_TICKET, email: "not-an-email" }), params);
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("lets a guest with no account buy tickets", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    const res = await POST(
      makeReq({ ...ONE_TICKET, email: "guest@example.com", name: "Jo Guest" }),
      params
    );
    expect(res.status).toBe(200);

    expect(mockRpc).toHaveBeenCalledWith(
      "reserve_ticket_order",
      expect.objectContaining({
        buyer_param: null,
        buyer_email_param: "guest@example.com",
        buyer_name_param: "Jo Guest",
      })
    );
    // Stripe still needs an email to complete the session.
    expect(mockSessionsCreate.mock.calls[0][0].customer_email).toBe("guest@example.com");
  });

  it("prefers the signed-in account over any email in the body", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "member@singjam.org" } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    await POST(makeReq({ ...ONE_TICKET, email: "attacker@example.com" }), params);
    expect(mockRpc).toHaveBeenCalledWith(
      "reserve_ticket_order",
      expect.objectContaining({ buyer_param: USER_ID, buyer_email_param: "member@singjam.org" })
    );
    expect(mockSessionsCreate.mock.calls[0][0].customer_email).toBe("member@singjam.org");
  });

  it("authenticates via bearer token when there is no cookie session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockBearerGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    const res = await POST(makeReq(ONE_TICKET, { Authorization: "Bearer tok" }), params);
    expect(res.status).toBe(200);
  });

  it("rejects an empty selection without touching the database", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    const res = await POST(makeReq({ items: [] }), params);
    expect(res.status).toBe(400);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("refuses to sell tickets for a non-official jam", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "X", visibility: "community" } }));
    const res = await POST(makeReq(ONE_TICKET), params);
    expect(res.status).toBe(400);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("surfaces the sold-out reason as 409 and never creates a Stripe session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID, name: "X", visibility: "official" } }));
    mockRpc.mockResolvedValue({ data: null, error: { message: "only 1 left of General" } });

    const res = await POST(makeReq({ items: [{ ticket_type_id: TYPE_ID, quantity: 5 }] }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("only 1 left of General");
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("reserves stock before creating the Stripe session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    const callOrder: string[] = [];
    mockRpc.mockImplementation(async () => {
      callOrder.push("reserve");
      return { data: ORDER_ID, error: null };
    });
    mockSessionsCreate.mockImplementation(async () => {
      callOrder.push("stripe");
      return { id: "cs_1", client_secret: "cs_secret" };
    });

    await POST(makeReq(ONE_TICKET), params);
    expect(callOrder).toEqual(["reserve", "stripe"]);
  });

  it("creates a custom-UI Checkout Session with dynamic payment methods", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    const res = await POST(makeReq(ONE_TICKET), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      order_id: ORDER_ID,
      client_secret: "cs_secret",
      amount_cents: 3000,
      currency: "usd",
    });

    const arg = mockSessionsCreate.mock.calls[0][0];
    // The enum has no 'custom' value; sending one is rejected outright.
    expect(arg.ui_mode).toBe("elements");
    expect(arg.mode).toBe("payment");
    expect(arg.integration_identifier).toBe("singjam_tickets_qxwmvpht");
    expect(arg.client_reference_id).toBe(ORDER_ID);
    expect(arg.metadata).toMatchObject({ order_id: ORDER_ID, jam_id: JAM_ID });
    // Hardcoding payment_method_types disables dynamic payment methods.
    expect(arg).not.toHaveProperty("payment_method_types");
    // Two ticket rows of one tier collapse into a single line item of qty 2.
    expect(arg.line_items).toHaveLength(1);
    expect(arg.line_items[0]).toMatchObject({ quantity: 2 });
    expect(arg.line_items[0].price_data).toMatchObject({ currency: "usd", unit_amount: 1500 });
    expect(arg.return_url).toContain("{CHECKOUT_SESSION_ID}");
  });

  it("excludes buy-now-pay-later without disabling dynamic payment methods", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    await POST(makeReq(ONE_TICKET), params);
    const arg = mockSessionsCreate.mock.calls[0][0];
    expect(arg.excluded_payment_method_types).toEqual(["klarna", "affirm", "afterpay_clearpay"]);
    // Exclusion is the supported lever; payment_method_types would freeze the list.
    expect(arg).not.toHaveProperty("payment_method_types");
  });

  it("prefills the signed-in buyer's email, which Stripe requires to complete", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "ben@example.org" } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    await POST(makeReq(ONE_TICKET), params);
    expect(mockSessionsCreate.mock.calls[0][0].customer_email).toBe("ben@example.org");
  });

  it("omits customer_email rather than sending null when the account has no email", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    await POST(makeReq(ONE_TICKET), params);
    expect(mockSessionsCreate.mock.calls[0][0]).not.toHaveProperty("customer_email");
  });

  it("keeps the session payable window inside Stripe's 30-minute floor and under the db hold", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    const before = Math.floor(Date.now() / 1000);
    await POST(makeReq(ONE_TICKET), params);
    const arg = mockSessionsCreate.mock.calls[0][0];
    const windowSecs = arg.expires_at - before;

    // Stripe rejects anything under 30 minutes out.
    expect(windowSecs).toBeGreaterThanOrEqual(30 * 60);
    // And the session must die before the db hold releases the stock, or a late
    // payment lands on an order the sweeper already expired.
    expect(windowSecs).toBeLessThan(35 * 60);

    // The hold passed to the RPC is the longer of the two.
    expect(mockRpc).toHaveBeenCalledWith(
      "reserve_ticket_order",
      expect.objectContaining({ hold_minutes: 35 })
    );
  });

  it("stores the session id on the order so webhook redelivery is idempotent", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_abc", client_secret: "cs_secret" });

    await POST(makeReq(ONE_TICKET), params);
    const updateChain = mockAdminFrom.mock.results[3].value;
    expect(updateChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_checkout_session_id: "cs_abc" })
    );
  });

  it("applies a promo code registered for this event", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockResolvePromo.mockResolvedValue({
      valid: true, code: "EARLYBIRD", label: "10% off",
      promotionCodeId: "promo_123", discountCents: 300, totalCents: 2700,
    });
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    const res = await POST(makeReq({ ...ONE_TICKET, promo_code: "EARLYBIRD" }), params);
    expect(res.status).toBe(200);
    // Stripe applies the discount and its amount_total becomes authoritative.
    expect(mockSessionsCreate.mock.calls[0][0].discounts).toEqual([{ promotion_code: "promo_123" }]);
  });

  it("records which promo code a charged order used", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockAdminFrom.mockReturnValueOnce(chain({ error: null })); // promo_code_id update
    mockResolvePromo.mockResolvedValue({
      valid: true, code: "EARLYBIRD", label: "10% off", promoCodeId: "pc-1",
      promotionCodeId: "promo_123", discountCents: 300, totalCents: 2700,
    });
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    expect((await POST(makeReq({ ...ONE_TICKET, promo_code: "EARLYBIRD" }), params)).status).toBe(200);
    expect(mockAdminFrom.mock.results[TRAILING + 1].value.update).toHaveBeenCalledWith({ promo_code_id: "pc-1" });
  });

  it("still starts checkout when the promo code can't be recorded", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockAdminFrom.mockReturnValueOnce(chain({ error: { message: "column does not exist" } }));
    mockResolvePromo.mockResolvedValue({
      valid: true, code: "EARLYBIRD", label: "10% off", promoCodeId: "pc-1",
      promotionCodeId: "promo_123", discountCents: 300, totalCents: 2700,
    });
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    const res = await POST(makeReq({ ...ONE_TICKET, promo_code: "EARLYBIRD" }), params);
    expect(res.status).toBe(200);
    expect((await res.json()).client_secret).toBe("cs_secret");
  });

  it("refuses a code not registered for this event and releases the stock", async () => {
    // Codes are account-wide in Stripe, so this is what stops one event's
    // discount being redeemed on another event's checkout.
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockResolvePromo.mockResolvedValue({ valid: false, reason: "That code isn't valid for this event" });

    const res = await POST(makeReq({ ...ONE_TICKET, promo_code: "OTHEREVENT" }), params);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/this event/i);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    // Otherwise the tickets sit reserved for the full hold window for nothing.
    const releaseChain = mockAdminFrom.mock.results[TRAILING].value;
    expect(releaseChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });

  it("does not look up a promo code when none is supplied", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ id: "cs_1", client_secret: "cs_secret" });

    await POST(makeReq(ONE_TICKET), params);
    expect(mockResolvePromo).not.toHaveBeenCalled();
    expect(mockSessionsCreate.mock.calls[0][0]).not.toHaveProperty("discounts");
  });

  it("skips Stripe entirely when a code takes the total to zero", async () => {
    // A comped ticket isn't a payment. Creating a $0 session would still render
    // a card form and ask the buyer to pay nothing.
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockResolvePromo.mockResolvedValue({
      valid: true, code: "COMP100", label: "100% off", promoCodeId: "pc-free",
      promotionCodeId: "promo_free", discountCents: 3000, totalCents: 0,
    });
    mockFulfil.mockResolvedValue({ id: ORDER_ID });

    const res = await POST(makeReq({ ...ONE_TICKET, promo_code: "COMP100" }), params);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ free: true, order_id: ORDER_ID, amount_cents: 0 });
    expect(json.client_secret).toBeNull();
    expect(mockSessionsCreate).not.toHaveBeenCalled();
    // Fulfilled through the same path a charged order takes, recording $0.
    expect(mockFulfil).toHaveBeenCalledWith(expect.anything(), ORDER_ID, { amountCents: 0 });
    // Stripe never sees this use, so the order carries the code for the count.
    expect(mockAdminFrom.mock.results[TRAILING].value.update).toHaveBeenCalledWith({ promo_code_id: "pc-free" });
  });

  it("releases the stock if a free order can no longer be fulfilled", async () => {
    // fulfilPendingOrder returns null when the order is not pending any more —
    // expired, or already claimed by a racing request.
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockResolvePromo.mockResolvedValue({
      valid: true, code: "COMP100", label: "100% off",
      promotionCodeId: "promo_free", discountCents: 3000, totalCents: 0,
    });
    mockFulfil.mockResolvedValue(null);

    const res = await POST(makeReq({ ...ONE_TICKET, promo_code: "COMP100" }), params);
    expect(res.status).toBe(409);
    expect(mockSessionsCreate).not.toHaveBeenCalled();
  });

  it("falls back to the default configuration when the pm config id is for the wrong mode", async () => {
    // A pmc_ id belongs to one Stripe mode. Pointing a test deploy at the live
    // id killed every sale with resource_missing, so this degrades instead.
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    const err: any = new Error("No such payment_method_configuration: pmc_live");
    err.code = "resource_missing";
    mockSessionsCreate
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ id: "cs_1", client_secret: "cs_secret" });

    const res = await POST(makeReq(ONE_TICKET), params);

    expect(res.status).toBe(200);
    expect(mockSessionsCreate).toHaveBeenCalledTimes(2);
    expect(mockSessionsCreate.mock.calls[0][0]).toHaveProperty("payment_method_configuration", "pmc_test_cfg");
    expect(mockSessionsCreate.mock.calls[1][0]).not.toHaveProperty("payment_method_configuration");
  });

  it("releases the hold when Stripe rejects the session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    happyPathDb();
    mockSessionsCreate.mockRejectedValue(new Error("stripe down"));

    const res = await POST(makeReq(ONE_TICKET), params);
    expect(res.status).toBe(502);
    const updateChain = mockAdminFrom.mock.results[3].value;
    expect(updateChain.update).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});

describe("cover fees", () => {
  // The route reads the flag off the body and defaults it to false, so a
  // request that says nothing is never charged extra.
  async function post(body: any) {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ client_secret: "cs_secret" });
    return POST(makeReq({ ...ONE_TICKET, email: "guest@example.com", ...body }), params as any);
  }
  const lineItems = () => mockSessionsCreate.mock.calls[0][0].line_items;

  it("adds a processing fee line item when the buyer covers it", async () => {
    await post({ cover_fees: true });
    const fee = lineItems().find((l: any) => l.price_data.product_data.name === "Processing fee");
    // $30.00 order: (3000 + 30) / 0.971 = 3120.5 -> 3121, so 121c.
    expect(fee).toBeTruthy();
    expect(fee.quantity).toBe(1);
    expect(fee.price_data.unit_amount).toBe(121);
  });

  it("charges only the ticket when the buyer unticks it", async () => {
    await post({ cover_fees: false });
    expect(lineItems().some((l: any) => l.price_data.product_data.name === "Processing fee")).toBe(false);
  });

  it("adds nothing when the request does not mention fees", async () => {
    await post({});
    expect(lineItems()).toHaveLength(1);
  });

  it("keeps the fee as its own line rather than inflating the ticket price", async () => {
    await post({ cover_fees: true });
    const ticket = lineItems().find((l: any) => l.price_data.product_data.name !== "Processing fee");
    expect(ticket.price_data.unit_amount).toBe(1500);
  });
});

describe("mailing list opt-in", () => {
  it("records a guest's opt-in against the order", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    happyPathDb();
    // The opt-in write is an extra ticket_orders chain ahead of the rest.
    mockAdminFrom.mockReturnValueOnce(chain({ error: null }));
    mockSessionsCreate.mockResolvedValue({ client_secret: "cs_secret" });

    await POST(
      makeReq({ ...ONE_TICKET, email: "guest@example.com", marketing_opt_in: true }),
      params as any
    );

    const updates = mockAdminFrom.mock.results
      .map((r: any) => r.value.update)
      .filter((u: any) => u && u.mock.calls.length);
    expect(updates.some((u: any) => u.mock.calls.some((c: any) => c[0]?.marketing_opt_in === true))).toBe(true);
  });

  it("does not record an opt-in that was never given", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ client_secret: "cs_secret" });

    await POST(makeReq({ ...ONE_TICKET, email: "guest@example.com" }), params as any);

    const updates = mockAdminFrom.mock.results
      .map((r: any) => r.value.update)
      .filter((u: any) => u && u.mock.calls.length);
    expect(updates.some((u: any) => u.mock.calls.some((c: any) => c[0]?.marketing_opt_in === true))).toBe(false);
  });

  it("ignores the flag for a signed-in member, who is never asked", async () => {
    // Members subscribe by creating an account; a member order claiming an
    // opt-in did not come from a checkbox we showed.
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID, email: "member@singjam.org" } } });
    happyPathDb();
    mockSessionsCreate.mockResolvedValue({ client_secret: "cs_secret" });

    await POST(makeReq({ ...ONE_TICKET, marketing_opt_in: true }), params as any);

    const updates = mockAdminFrom.mock.results
      .map((r: any) => r.value.update)
      .filter((u: any) => u && u.mock.calls.length);
    expect(updates.some((u: any) => u.mock.calls.some((c: any) => c[0]?.marketing_opt_in === true))).toBe(false);
  });
});
