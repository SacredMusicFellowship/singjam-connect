import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAdminFrom, mockFetchAllRows } = vi.hoisted(() => ({
  mockAdminFrom: vi.fn(),
  mockFetchAllRows: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({ from: mockAdminFrom })),
}));
vi.mock("@singjam/core", () => ({ fetchAllRows: mockFetchAllRows }));

import { GET } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "is", "order", "range"]) c[m] = vi.fn().mockReturnValue(c);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

const JAM = "jam-1";
const params = Promise.resolve({ id: JAM });
const req = new Request("http://localhost/api/jam/jam-1/attendees/guests");

/** A guest ticket: nobody's account attached. */
const guest = (order: string, name: string | null, email: string | null = null, buyerName = name) => ({
  order_id: order,
  holder_user_id: null,
  holder_name: name,
  ticket_orders: { status: "paid", buyer_name: buyerName, buyer_email: email },
});

/** A ticket held by an account holder. */
const member = (order: string, userId: string) => ({
  order_id: order,
  holder_user_id: userId,
  holder_name: null,
  ticket_orders: { status: "paid", buyer_name: null, buyer_email: "member@example.com" },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAdminFrom.mockReturnValue(chain({ data: { id: JAM } })); // jam exists
});

describe("GET /api/jam/[id]/attendees/guests", () => {
  it("lists a guest by the name they bought under", async () => {
    mockFetchAllRows.mockResolvedValue([guest("o1", "Ada Lovelace")]);
    const res = await GET(req, { params });
    expect(await res.json()).toEqual({
      guests: [{ name: "Ada Lovelace", extra: 0 }],
      members: [],
    });
  });

  it("collapses a multi-ticket order into one row with a count", async () => {
    // One name was given for four tickets; four identical rows reads as a bug.
    mockFetchAllRows.mockResolvedValue([
      guest("o1", "Ada"), guest("o1", "Ada"), guest("o1", "Ada"), guest("o1", "Ada"),
    ]);
    const res = await GET(req, { params });
    expect(await res.json()).toEqual({ guests: [{ name: "Ada", extra: 3 }], members: [] });
  });

  it("merges a guest who came back and bought again on the same email", async () => {
    // Grouping per order showed the same person twice. Their seats add up
    // instead.
    mockFetchAllRows.mockResolvedValue([
      guest("o1", "Ada", "ada@example.com"),
      guest("o2", "Ada", "ADA@example.com "), // same address, different casing
      guest("o2", "Ada", "ada@example.com"),
    ]);
    const res = await GET(req, { params });
    expect(await res.json()).toEqual({ guests: [{ name: "Ada", extra: 2 }], members: [] });
  });

  it("keeps different buyers separate", async () => {
    mockFetchAllRows.mockResolvedValue([
      guest("o1", "Ada", "ada@example.com"),
      guest("o2", "Grace", "grace@example.com"),
    ]);
    const res = await GET(req, { params });
    expect((await res.json()).guests).toEqual([
      { name: "Ada", extra: 0 },
      { name: "Grace", extra: 0 },
    ]);
  });

  it("falls back to the order when a guest order carries no email", async () => {
    // Two nameless, emailless orders are two different people, not one.
    mockFetchAllRows.mockResolvedValue([guest("o1", null, null, null), guest("o2", null, null, null)]);
    const res = await GET(req, { params });
    expect((await res.json()).guests).toEqual([
      { name: "Guest", extra: 0 },
      { name: "Guest", extra: 0 },
    ]);
  });

  it("falls back to the buyer name, then to 'Guest'", async () => {
    mockFetchAllRows.mockResolvedValue([
      guest("o1", null, "grace@example.com", "Grace"),
      guest("o2", null, "nobody@example.com", null),
    ]);
    const res = await GET(req, { params });
    expect((await res.json()).guests).toEqual([
      { name: "Grace", extra: 0 },
      { name: "Guest", extra: 0 },
    ]);
  });

  it("reports a member's surplus tickets, since their RSVP only counts one", async () => {
    // The bug this exists for: a couple buying two seats registered as one
    // person going, while a guest buying two registered as two.
    mockFetchAllRows.mockResolvedValue([member("o1", "u1"), member("o1", "u1"), member("o1", "u1")]);
    const res = await GET(req, { params });
    expect(await res.json()).toEqual({ guests: [], members: [{ user_id: "u1", extra: 2 }] });
  });

  it("sums a member's tickets across separate purchases", async () => {
    mockFetchAllRows.mockResolvedValue([member("o1", "u1"), member("o2", "u1")]);
    const res = await GET(req, { params });
    expect((await res.json()).members).toEqual([{ user_id: "u1", extra: 1 }]);
  });

  it("says nothing about a member holding a single ticket", async () => {
    // Their RSVP row already accounts for them; a zero would be noise.
    mockFetchAllRows.mockResolvedValue([member("o1", "u1")]);
    expect((await (await GET(req, { params })).json()).members).toEqual([]);
  });

  it("keeps members and guests apart on a mixed event", async () => {
    mockFetchAllRows.mockResolvedValue([
      member("o1", "u1"), member("o1", "u1"),
      guest("o2", "Ada", "ada@example.com"),
      guest("o2", "Ada", "ada@example.com"),
    ]);
    const res = await GET(req, { params });
    expect(await res.json()).toEqual({
      guests: [{ name: "Ada", extra: 1 }],
      members: [{ user_id: "u1", extra: 1 }],
    });
  });

  it("asks only for tickets on paid orders", async () => {
    mockFetchAllRows.mockResolvedValue([]);
    await GET(req, { params });
    // Run the builder the route handed to fetchAllRows and inspect the filters.
    const build = mockFetchAllRows.mock.calls[0][0];
    const c = chain({ data: [] });
    mockAdminFrom.mockReturnValue(c);
    build(0, 999);
    expect(c.eq).toHaveBeenCalledWith("ticket_orders.status", "paid");
    expect(c.order).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("never exposes an email or a door code in the response", async () => {
    // Asserted on what is sent, not on the query: buyer_email is now read as a
    // grouping key, so a select-string check would pass while leaking. This
    // route is not host-gated, unlike the door list at ../../tickets/orders.
    mockFetchAllRows.mockResolvedValue([
      guest("o1", "Ada", "ada@example.com"),
      member("o2", "u1"),
      member("o2", "u1"),
    ]);
    const body = await (await GET(req, { params })).text();
    expect(body).not.toMatch(/ada@example\.com/i);
    expect(body).not.toMatch(/member@example\.com/i);
    expect(body).not.toMatch(/email/i);
    expect(body).not.toMatch(/qr_token/i);
  });

  it("404s for a jam that doesn't exist", async () => {
    mockAdminFrom.mockReturnValue(chain({ data: null }));
    const res = await GET(req, { params });
    expect(res.status).toBe(404);
  });
});
