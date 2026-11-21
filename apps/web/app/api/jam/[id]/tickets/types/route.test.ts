import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockBearerGetUser, mockAdminFrom, mockRpc, mockServerFrom, mockCanManage } = vi.hoisted(() => ({
  mockCanManage: vi.fn(),
  mockGetUser: vi.fn(),
  mockBearerGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockServerFrom: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser }, from: mockServerFrom }),
}));
vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: mockBearerGetUser } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom, rpc: mockRpc })),
}));

vi.mock("@/lib/jamAuthz", () => ({ canManageJam: mockCanManage }));

import { GET, POST, PATCH, PUT, DELETE } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "insert", "update", "delete", "order"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const JAM_ID = "jam-1";
const HOST = "host-1";
const COHOST = "cohost-1";
const STRANGER = "rando-1";
const TYPE_ID = "type-1";

const params = { params: Promise.resolve({ id: JAM_ID }) };

function req(method: string, body?: any, url = `http://localhost/api/jam/${JAM_ID}/tickets/types`) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks does not drain mockReturnValueOnce queues, and routes now
  // consume different numbers of chains than they used to — a leftover would
  // silently become the next test's first lookup.
  mockAdminFrom.mockReset();
  // Anything not queued reads as "no row" — e.g. the GET's jams lookup for an
  // event with no total ticket limit.
  mockAdminFrom.mockReturnValue(chain({ data: null }));
  mockCanManage.mockResolvedValue(true);
});

describe("GET /api/jam/[id]/tickets/types", () => {
  it("404s when the jam is not visible to the caller", async () => {
    // The jams RLS policy decides visibility; an invisible jam reads as null.
    mockServerFrom.mockReturnValueOnce(chain({ data: null }));
    const res = await GET(req("GET"), params);
    expect(res.status).toBe(404);
  });

  it("returns tiers with derived availability", async () => {
    mockServerFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    mockAdminFrom.mockReturnValueOnce(
      chain({
        data: [
          { id: TYPE_ID, name: "General", price_cents: 1500, currency: "usd", quantity: 10,
            sales_start_at: null, sales_end_at: null, sort_order: 0, description: null },
        ],
      })
    );
    // First call is sold_count (counts live holds), second is paid_count.
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "ticket_type_paid_count" ? 3 : 4 })
    );

    const res = await GET(req("GET"), params);
    const json = await res.json();
    expect(res.status).toBe(200);
    // 4 against stock, 3 of them paid → 1 merely held, 6 left.
    expect(json.ticket_types[0]).toMatchObject({ sold: 3, held: 1, remaining: 6, on_sale: true });
  });

  it("marks a tier sold out rather than reporting negative stock", async () => {
    mockServerFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    mockAdminFrom.mockReturnValueOnce(
      chain({
        data: [
          { id: TYPE_ID, name: "General", price_cents: 1500, currency: "usd", quantity: 5,
            sales_start_at: null, sales_end_at: null, sort_order: 0, description: null },
        ],
      })
    );
    mockRpc.mockResolvedValue({ data: 5 });

    const json = await (await GET(req("GET"), params)).json();
    expect(json.ticket_types[0]).toMatchObject({ remaining: 0, on_sale: false });
  });

  it("closes sales once the window has passed", async () => {
    mockServerFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    mockAdminFrom.mockReturnValueOnce(
      chain({
        data: [
          { id: TYPE_ID, name: "Early bird", price_cents: 1000, currency: "usd", quantity: null,
            sales_start_at: null, sales_end_at: new Date(Date.now() - 1000).toISOString(),
            sort_order: 0, description: null },
        ],
      })
    );
    mockRpc.mockResolvedValue({ data: 0 });

    const json = await (await GET(req("GET"), params)).json();
    expect(json.ticket_types[0]).toMatchObject({ closed: true, on_sale: false });
  });

  it("reports no event limit when none is set", async () => {
    mockServerFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    mockAdminFrom.mockReturnValueOnce(chain({ data: [] }));
    const json = await (await GET(req("GET"), params)).json();
    expect(json.ticket_limit).toBeNull();
  });

  describe("with a total ticket limit", () => {
    const tiers = [
      { id: "advance", name: "Advance", price_cents: 1500, currency: "usd", quantity: null,
        sales_start_at: null, sales_end_at: null, sort_order: 0, description: null },
      { id: "supporter", name: "Supporter", price_cents: 3600, currency: "usd", quantity: 10,
        sales_start_at: null, sales_end_at: null, sort_order: 1, description: null },
    ];
    // Advance: 50 against stock (45 paid). Supporter: 8 against stock (8 paid).
    const counts: Record<string, { counted: number; paid: number }> = {
      advance: { counted: 50, paid: 45 },
      supporter: { counted: 8, paid: 8 },
    };

    function setupLimit(limit: number) {
      mockServerFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
      mockAdminFrom
        .mockReturnValueOnce(chain({ data: tiers }))
        .mockReturnValueOnce(chain({ data: { ticket_limit: limit } }));
      mockRpc.mockImplementation((fn: string, { type_id }: { type_id: string }) =>
        Promise.resolve({
          data: fn === "ticket_type_paid_count" ? counts[type_id].paid : counts[type_id].counted,
        })
      );
    }

    it("totals the tiers and bounds each tier by what the event has left", async () => {
      setupLimit(60);
      const json = await (await GET(req("GET"), params)).json();
      // 58 of 60 taken across both tiers.
      expect(json.ticket_limit).toEqual({ quantity: 60, sold: 53, held: 5, remaining: 2 });
      // Uncapped Advance gets the event's 2; Supporter's own 2 is no tighter.
      expect(json.ticket_types[0]).toMatchObject({ remaining: 2, on_sale: true });
      expect(json.ticket_types[1]).toMatchObject({ remaining: 2, on_sale: true });
    });

    it("keeps a tier's own cap when it is tighter than the event's", async () => {
      setupLimit(100);
      const json = await (await GET(req("GET"), params)).json();
      expect(json.ticket_types[0].remaining).toBe(42);
      expect(json.ticket_types[1].remaining).toBe(2);
    });

    it("takes every tier off sale once the event total is reached", async () => {
      setupLimit(58);
      const json = await (await GET(req("GET"), params)).json();
      expect(json.ticket_limit.remaining).toBe(0);
      for (const t of json.ticket_types) expect(t).toMatchObject({ remaining: 0, on_sale: false });
    });
  });
});

describe("PUT /api/jam/[id]/tickets/types (event ticket limit)", () => {
  it("rejects an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } });
    const res = await PUT(req("PUT", { ticket_limit: 100 }), params);
    expect(res.status).toBe(401);
  });

  it("refuses someone who cannot manage the event", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: STRANGER } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    mockCanManage.mockResolvedValueOnce(false);
    const res = await PUT(req("PUT", { ticket_limit: 100 }), params);
    expect(res.status).toBe(403);
  });

  it.each([0, -5, 2.5, "100"])("rejects %p", async (value) => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    const res = await PUT(req("PUT", { ticket_limit: value }), params);
    expect(res.status).toBe(400);
  });

  it("refuses to set the total below tickets already sold or held", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    mockRpc.mockResolvedValueOnce({ data: 40 });
    const res = await PUT(req("PUT", { ticket_limit: 30 }), params);
    expect(res.status).toBe(409);
    expect(mockRpc).toHaveBeenCalledWith("jam_ticket_sold_count", { jam_id_param: JAM_ID });
  });

  it("sets the total", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: HOST } } });
    const update = chain({ error: null });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } })).mockReturnValueOnce(update);
    mockRpc.mockResolvedValueOnce({ data: 40 });
    const res = await PUT(req("PUT", { ticket_limit: 40 }), params);
    expect(res.status).toBe(200);
    expect(update.update).toHaveBeenCalledWith({ ticket_limit: 40 });
    expect(update.eq).toHaveBeenCalledWith("id", JAM_ID);
  });

  it("removes the total with null, without checking sales", async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: HOST } } });
    const update = chain({ error: null });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } })).mockReturnValueOnce(update);
    const res = await PUT(req("PUT", { ticket_limit: null }), params);
    expect(res.status).toBe(200);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(update.update).toHaveBeenCalledWith({ ticket_limit: null });
  });
});

describe("POST /api/jam/[id]/tickets/types", () => {
  it("rejects an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(req("POST", { name: "General", price_cents: 1500 }), params);
    expect(res.status).toBe(401);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("refuses a signed-in stranger", async () => {
    mockCanManage.mockResolvedValue(false);
    mockGetUser.mockResolvedValue({ data: { user: { id: STRANGER } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } })); // jam

    const res = await POST(req("POST", { name: "General", price_cents: 1500 }), params);
    expect(res.status).toBe(403);
  });

  it("allows a co-host, not just the host", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COHOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(chain({ data: { id: TYPE_ID } })); // insert

    const res = await POST(req("POST", { name: "General", price_cents: 1500 }), params);
    expect(res.status).toBe(200);
  });

  it("rejects a non-integer price", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    const res = await POST(req("POST", { name: "General", price_cents: 15.5 }), params);
    expect(res.status).toBe(400);
  });

  it("rejects a negative price", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    const res = await POST(req("POST", { name: "General", price_cents: -100 }), params);
    expect(res.status).toBe(400);
  });

  it("rejects a blank name", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    const res = await POST(req("POST", { name: "   ", price_cents: 1500 }), params);
    expect(res.status).toBe(400);
  });

  it("accepts a free tier at zero cents", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(chain({ data: { id: TYPE_ID } }));
    const res = await POST(req("POST", { name: "Free", price_cents: 0 }), params);
    expect(res.status).toBe(200);
  });

  it("rejects a window that ends before it starts, in words not SQL", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    const res = await POST(
      req("POST", {
        name: "Day-Of",
        price_cents: 2000,
        sales_start_at: "2026-10-04T07:00:00.000Z",
        sales_end_at: "2026-10-04T06:00:00.000Z",
      }),
      params
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Sales must end after they start");
  });

  it("rejects an unparseable sales date", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    const res = await POST(
      req("POST", { name: "Day-Of", price_cents: 2000, sales_start_at: "tomorrow-ish" }),
      params
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("valid date");
  });

  it("accepts a one-sided window — a tier can open with no close", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(chain({ data: { id: TYPE_ID } }));
    const res = await POST(
      req("POST", {
        name: "Day-Of",
        price_cents: 2000,
        sales_start_at: "2026-10-04T07:00:00.000Z",
        sales_end_at: null,
      }),
      params
    );
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/jam/[id]/tickets/types", () => {
  it("refuses to cut capacity below tickets already sold", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    mockRpc.mockResolvedValue({ data: 8 });

    const res = await PATCH(req("PATCH", { id: TYPE_ID, quantity: 5 }), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("8 already sold");
  });

  it("allows raising capacity", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(chain({ error: null }));
    mockRpc.mockResolvedValue({ data: 8 });

    const res = await PATCH(req("PATCH", { id: TYPE_ID, quantity: 20 }), params);
    expect(res.status).toBe(200);
  });

  it("renames and reprices a tier that already has sales", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    const update = chain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(update);

    const res = await PATCH(
      req("PATCH", { id: TYPE_ID, name: "  Advance  ", price_cents: 1500 }),
      params
    );
    expect(res.status).toBe(200);
    // Trimmed on the way in, so a stray space can't become part of the name
    // buyers see on their ticket.
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Advance", price_cents: 1500 })
    );
  });

  it("rejects a blank rename", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    const res = await PATCH(req("PATCH", { id: TYPE_ID, name: "   " }), params);
    expect(res.status).toBe(400);
  });

  it("checks a one-sided window change against the stored other side", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      // The row's existing window: opens Oct 4, no close.
      .mockReturnValueOnce(
        chain({ data: { sales_start_at: "2026-10-04T07:00:00.000Z", sales_end_at: null } })
      );

    // Setting only the end, to an instant before the stored start.
    const res = await PATCH(
      req("PATCH", { id: TYPE_ID, sales_end_at: "2026-10-01T07:00:00.000Z" }),
      params
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Sales must end after they start");
  });

  it("clears a window when a field is nulled", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    const update = chain({ error: null });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(
        chain({ data: { sales_start_at: "2026-10-04T07:00:00.000Z", sales_end_at: null } })
      )
      .mockReturnValueOnce(update);

    const res = await PATCH(
      req("PATCH", { id: TYPE_ID, sales_start_at: null, sales_end_at: null }),
      params
    );
    expect(res.status).toBe(200);
    expect(update.update).toHaveBeenCalledWith(
      expect.objectContaining({ sales_start_at: null, sales_end_at: null })
    );
  });
});

describe("DELETE /api/jam/[id]/tickets/types", () => {
  it("refuses to delete a tier that has sold tickets", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    mockRpc.mockResolvedValue({ data: 3 });

    const res = await DELETE(
      req("DELETE", undefined, `http://localhost/api/jam/${JAM_ID}/tickets/types?type_id=${TYPE_ID}`),
      params
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("3 ticket(s) sold");
  });

  it("deletes an unsold tier", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(chain({ error: null }));
    mockRpc.mockResolvedValue({ data: 0 });

    const res = await DELETE(
      req("DELETE", undefined, `http://localhost/api/jam/${JAM_ID}/tickets/types?type_id=${TYPE_ID}`),
      params
    );
    expect(res.status).toBe(200);
  });
  it("reports a hold as held, not sold — an abandoned checkout is not revenue", async () => {
    mockServerFrom.mockReturnValueOnce(chain({ data: { id: JAM_ID } }));
    mockAdminFrom.mockReturnValueOnce(
      chain({
        data: [
          { id: TYPE_ID, name: "General", price_cents: 1500, currency: "usd", quantity: 20,
            sales_start_at: null, sales_end_at: null, sort_order: 0, description: null },
        ],
      })
    );
    // 4 tickets holding stock, none paid for.
    mockRpc.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "ticket_type_paid_count" ? 0 : 4 })
    );

    const json = await (await GET(req("GET"), params)).json();
    const tier = json.ticket_types[0];
    expect(tier.sold).toBe(0);
    expect(tier.held).toBe(4);
    // Availability still subtracts the holds, or two buyers could take one seat.
    expect(tier.remaining).toBe(16);
  });
});
