import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetUser, mockAdminFrom, mockFetchAllRows, mockCanManage, mockResolveFees } = vi.hoisted(() => ({
  mockCanManage: vi.fn(),
  mockResolveFees: vi.fn(),
  mockGetUser: vi.fn(),
  mockAdminFrom: vi.fn(),
  mockFetchAllRows: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn().mockResolvedValue({ auth: { getUser: mockGetUser } }),
}));
vi.mock("@/lib/supabase/bearer", () => ({
  supabaseFromBearer: vi.fn(() => ({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));
vi.mock("@singjam/core", () => ({ fetchAllRows: mockFetchAllRows }));

vi.mock("@/lib/jamAuthz", () => ({ canManageJam: mockCanManage }));
vi.mock("@/lib/stripeFees", () => ({ resolveStripeFees: mockResolveFees }));

import { GET } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "in", "order", "range"]) c[m] = vi.fn().mockReturnValue(c);
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const JAM_ID = "jam-1";
const HOST = "host-1";
const COHOST = "cohost-1";
const params = { params: Promise.resolve({ id: JAM_ID }) };
const req = () => new Request(`http://localhost/api/jam/${JAM_ID}/tickets/orders`);

function ticket(over: any = {}) {
  return {
    id: over.id ?? "t1",
    qr_token: over.qr_token ?? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    holder_name: null,
    holder_email: null,
    checked_in_at: null,
    ticket_types: { name: "General" },
    ticket_orders: {
      id: over.order_id ?? "o1",
      status: "paid",
      buyer_name: "Jo Guest",
      buyer_email: "guest@example.com",
      buyer_user_id: null,
      amount_cents: 3000,
      currency: "usd",
      paid_at: "2026-08-07T00:00:00Z",
      ...(over.order ?? {}),
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks does not drain mockReturnValueOnce queues, and routes now
  // consume different numbers of chains than they used to — a leftover would
  // silently become the next test's first lookup.
  mockAdminFrom.mockReset();
  mockCanManage.mockResolvedValue(true);
  mockFetchAllRows.mockResolvedValue([]);
  mockResolveFees.mockResolvedValue({ feeCents: 0, pending: 0 });
});

describe("GET /api/jam/[id]/tickets/orders", () => {
  it("rejects an unauthenticated caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(req(), params);
    expect(res.status).toBe(401);
    expect(mockFetchAllRows).not.toHaveBeenCalled();
  });

  it("refuses a stranger — buyer emails must not leak", async () => {
    mockCanManage.mockResolvedValue(false);
    mockGetUser.mockResolvedValue({ data: { user: { id: "rando" } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));

    const res = await GET(req(), params);
    expect(res.status).toBe(403);
    expect(mockFetchAllRows).not.toHaveBeenCalled();
  });

  it("allows a co-host", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: COHOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } }))
      .mockReturnValueOnce(chain({ data: { id: "ch1" } }));

    const res = await GET(req(), params);
    expect(res.status).toBe(200);
  });

  it("counts a multi-ticket order's revenue once, not once per ticket", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    // One $30 order containing two tickets.
    mockFetchAllRows.mockResolvedValue([
      ticket({ id: "t1", order_id: "o1" }),
      ticket({ id: "t2", order_id: "o1" }),
    ]);

    const json = await (await GET(req(), params)).json();
    expect(json.summary.tickets_sold).toBe(2);
    expect(json.summary.orders).toBe(1);
    // The bug this guards: summing per ticket would report 6000.
    expect(json.summary.gross_cents).toBe(3000);
  });

  it("gives every ticket row what its buyer paid for the whole order", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    mockFetchAllRows.mockResolvedValue([
      ticket({ id: "t1", order_id: "o1" }),
      ticket({ id: "t2", order_id: "o1" }),
      ticket({ id: "t3", order_id: "o2" }),
    ]);

    const json = await (await GET(req(), params)).json();
    const byTicket = Object.fromEntries(json.guests.map((g: any) => [g.ticket_id, g]));
    expect(byTicket.t1).toMatchObject({ order_amount_cents: 3000, order_tickets: 2 });
    expect(byTicket.t2).toMatchObject({ order_amount_cents: 3000, order_tickets: 2 });
    expect(byTicket.t3).toMatchObject({ order_tickets: 1 });
  });

  it("numbers each ticket within its order and keeps an order's tickets together", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    // Same buyer name on two orders: each order's tickets must stay adjacent.
    mockFetchAllRows.mockResolvedValue([
      ticket({ id: "t1", order_id: "o2" }),
      ticket({ id: "t2", order_id: "o1" }),
      ticket({ id: "t3", order_id: "o2" }),
      ticket({ id: "t4", order_id: "o1" }),
    ]);

    const json = await (await GET(req(), params)).json();
    expect(json.guests.map((g: any) => [g.ticket_id, g.order_position, g.order_tickets])).toEqual([
      ["t2", 1, 2],
      ["t4", 2, 2],
      ["t1", 1, 2],
      ["t3", 2, 2],
    ]);
  });

  it("labels guests and resolves member names from their profile", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } })) // jam
      .mockReturnValueOnce(
        chain({
          data: [{ id: "u1", display_name: "Ben", last_name: "Kramarz", username: "ben" }],
        })
      ); // profiles

    mockFetchAllRows.mockResolvedValue([
      ticket({ id: "t1", order_id: "o1" }),
      ticket({
        id: "t2",
        order_id: "o2",
        order: { id: "o2", buyer_user_id: "u1", buyer_name: null, buyer_email: null },
      }),
    ]);

    const json = await (await GET(req(), params)).json();
    const byId = Object.fromEntries(json.guests.map((g: any) => [g.ticket_id, g]));
    expect(byId.t1).toMatchObject({ name: "Jo Guest", is_member: false });
    // display_name is the first name only: a door list of "Ben" is unusable.
    expect(byId.t2).toMatchObject({ name: "Ben Kramarz", is_member: true });
  });

  it("falls back through last name and username for a sparse profile", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { host_user_id: HOST } })) // jam
      .mockReturnValueOnce(
        chain({
          data: [
            { id: "u1", display_name: "Cher", last_name: null, username: "cher" },
            { id: "u2", display_name: null, last_name: null, username: "ghost" },
          ],
        })
      ); // profiles

    mockFetchAllRows.mockResolvedValue([
      ticket({
        id: "t1",
        order_id: "o1",
        order: { id: "o1", buyer_user_id: "u1", buyer_name: null, buyer_email: null },
      }),
      ticket({
        id: "t2",
        order_id: "o2",
        order: { id: "o2", buyer_user_id: "u2", buyer_name: null, buyer_email: null },
      }),
    ]);

    const json = await (await GET(req(), params)).json();
    const byId = Object.fromEntries(json.guests.map((g: any) => [g.ticket_id, g]));
    expect(byId.t1.name).toBe("Cher");
    expect(byId.t2.name).toBe("ghost");
  });

  it("exposes a short door code derived from the ticket token", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    mockFetchAllRows.mockResolvedValue([ticket()]);

    const json = await (await GET(req(), params)).json();
    expect(json.guests[0].code).toBe("AAAAAA");
  });

  it("fetches the whole guest list rather than one capped page", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    await GET(req(), params);
    // A door list that silently truncates would leave paying attendees off it,
    // and a capped fee lookup would overstate the net.
    expect(mockFetchAllRows).toHaveBeenCalledTimes(2);
  });

  it("reports Stripe fees and the net after them", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: HOST } } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { host_user_id: HOST } }));
    mockFetchAllRows
      .mockResolvedValueOnce([ticket({ id: "t1", order_id: "o1" })])
      .mockResolvedValueOnce([{ id: "o1", stripe_payment_intent_id: "pi_1", stripe_fee_cents: null }]);
    mockResolveFees.mockResolvedValue({ feeCents: 117, pending: 1 });

    const json = await (await GET(req(), params)).json();
    expect(mockResolveFees).toHaveBeenCalledWith(expect.anything(), [
      { id: "o1", stripe_payment_intent_id: "pi_1", stripe_fee_cents: null },
    ]);
    expect(json.summary).toMatchObject({ gross_cents: 3000, fee_cents: 117, net_cents: 2883, fees_pending: 1 });
  });
});
