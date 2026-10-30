import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockMarkAttending, mockNotify, mockSend, mockAuthUsers, mockFindSet } = vi.hoisted(() => ({
  mockMarkAttending: vi.fn(),
  mockNotify: vi.fn(),
  mockSend: vi.fn(),
  mockAuthUsers: vi.fn(),
  mockFindSet: vi.fn(),
}));

vi.mock("@/lib/jamAttendance", () => ({ markAttending: mockMarkAttending }));
vi.mock("@/lib/notifications", () => ({ createNotification: mockNotify }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: mockSend } }, EVENTS_FROM_ADDRESS: "events@test" }));
vi.mock("@/lib/authUsers", () => ({ fetchAllAuthUsers: mockAuthUsers }));
vi.mock("@/lib/eventSet", () => ({ findEventSet: mockFindSet }));
vi.mock("@/lib/devSafety", () => ({ sideEffectsBlocked: () => false }));
vi.mock("@/lib/stripe", () => ({ SITE_URL: "https://singjam.org" }));

import { addJamLeader, publicLeaders, removeJamLeader, reseatLeaderAfterRefund, type JamLeaderRow } from "./jamLeaders";

// Per-table queues, so a test reads as "what each table returns" rather than
// depending on the exact order the helper happens to query them in.
function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "is", "ilike", "in", "order", "update", "insert", "delete"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

function adminWith(tables: Record<string, any[]>, authEmail: string | null = "member@example.com") {
  const calls: Record<string, any[]> = {};
  const from = vi.fn((table: string) => {
    const next = tables[table]?.shift() ?? { data: null, error: null };
    const c = chain(next);
    (calls[table] ??= []).push(c);
    return c;
  });
  const admin = {
    from,
    auth: { admin: { getUserById: vi.fn().mockResolvedValue({ data: { user: authEmail ? { email: authEmail } : null } }) } },
  } as any;
  return { admin, calls };
}

const OFFICIAL = {
  id: "jam-1",
  name: "Fall Sing",
  short_code: "abc123",
  visibility: "official",
  starts_at: "2026-11-01T18:00:00Z",
  timezone: "America/New_York",
  full_address: "1 Main St",
  neighborhood: null,
  host_user_id: "host-1",
};

const LEADER_ROW = {
  id: "leader-1",
  jam_id: "jam-1",
  user_id: "member-1",
  name: null,
  email: null,
  show_publicly: true,
  token: "11111111-2222-3333-4444-555555555555",
  order_id: "order-1",
  added_by: "host-1",
  created_at: "2026-10-30T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({ error: null });
  mockAuthUsers.mockResolvedValue([]);
  mockFindSet.mockResolvedValue({ id: "set-1", short_code: "set123" });
});

describe("addJamLeader", () => {
  it("refuses an event that isn't official", async () => {
    const { admin } = adminWith({ jams: [{ data: { ...OFFICIAL, visibility: "public" } }] });
    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", userId: "member-1" });
    expect(res).toEqual({ ok: false, status: 400, error: "Leaders can only be added to official events" });
  });

  it("requires a name and a valid email for someone without an account", async () => {
    const { admin } = adminWith({});
    expect(await addJamLeader(admin, { jamId: "jam-1", addedBy: "h", name: "", email: "a@b.co" })).toMatchObject({ status: 400 });
    expect(await addJamLeader(admin, { jamId: "jam-1", addedBy: "h", name: "Sam", email: "nope" })).toMatchObject({ status: 400 });
  });

  it("issues a member a comp ticket that is not a sale, seats them and emails them", async () => {
    const { admin, calls } = adminWith({
      jams: [{ data: OFFICIAL }],
      profiles: [{ data: { display_name: "Maria", last_name: "Lopez", username: "maria" } }, { data: [] }],
      jam_leaders: [{ data: null }, { data: LEADER_ROW }],
      ticket_orders: [{ data: [] }, { data: { id: "order-1" } }, { error: null }],
      tickets: [{ data: { qr_token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }],
    });

    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", userId: "member-1" });

    expect(res).toMatchObject({ ok: true, emailed: true });
    expect(calls.ticket_orders[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ source: "leader", status: "paid", amount_cents: 0, buyer_user_id: "member-1" })
    );
    // No tier: that is what keeps a leader out of every stock limit.
    const ticket = calls.tickets[0].insert.mock.calls[0][0];
    expect(ticket).not.toHaveProperty("ticket_type_id");
    expect(ticket).toMatchObject({ order_id: "order-1", holder_user_id: "member-1" });
    expect(mockMarkAttending).toHaveBeenCalledWith(admin, "jam-1", "member-1");
    expect(mockSend).toHaveBeenCalledWith(expect.objectContaining({ to: "member@example.com" }));
    const html = mockSend.mock.calls[0][0].html as string;
    expect(html).toContain("Update your RSVP");
    expect(html).toContain("Add to calendar");
    expect(html).toContain("https://singjam.org/api/jam/jam-1/ics");
    expect(html).not.toContain("/lead/");
    expect(html).toContain("AAAAAA");
    expect(html).not.toContain("added you");
    // Stamped, so the receipt sweeper never sends a "$0.00 paid" email on top.
    expect(calls.ticket_orders[2].update).toHaveBeenCalledWith({ ticket_email_sent_at: expect.any(String) });
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: "member-1", type: "jam_leader_added" }));
  });

  it("issues no second ticket to someone who already bought one, and tells the host what they paid", async () => {
    const bought = { data: [{ buyer_user_id: "member-1", buyer_email: null, amount_cents: 1500 }] };
    const { admin, calls } = adminWith({
      jams: [{ data: OFFICIAL }],
      profiles: [{ data: { display_name: "Maria" } }, { data: [] }],
      jam_leaders: [{ data: null }, { data: { ...LEADER_ROW, order_id: null } }],
      ticket_orders: [bought, bought],
    });

    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", userId: "member-1" });

    expect(res).toMatchObject({ ok: true, leader: { own_ticket_cents: 1500 } });
    expect(calls.tickets).toBeUndefined();
    expect(calls.ticket_orders.every((c: any) => c.insert.mock.calls.length === 0)).toBe(true);
    expect(calls.jam_leaders[1].insert).toHaveBeenCalledWith(expect.objectContaining({ order_id: null }));
    expect(mockSend.mock.calls[0][0].html).toContain("You already have a ticket");
  });

  it("adds a typed-in email as the member who owns it", async () => {
    mockAuthUsers.mockResolvedValue([{ id: "member-1", email: "Maria@Example.com" }]);
    const { admin, calls } = adminWith({
      jams: [{ data: OFFICIAL }, { data: OFFICIAL }],
      profiles: [{ data: { display_name: "Maria" } }, { data: null }, { data: [] }],
      jam_leaders: [{ data: null }, { data: LEADER_ROW }],
      ticket_orders: [{ data: [] }, { data: { id: "order-1" } }],
      tickets: [{ data: { qr_token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }],
    });

    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", name: "Maria", email: "maria@example.com" });

    expect(res.ok).toBe(true);
    expect(calls.ticket_orders[1].insert).toHaveBeenCalledWith(expect.objectContaining({ buyer_user_id: "member-1", buyer_email: null }));
  });

  it("gives someone without an account a ticket by email and a sign-up link", async () => {
    const guestRow = { ...LEADER_ROW, user_id: null, name: "Sam Guest", email: "sam@example.com" };
    const { admin, calls } = adminWith({
      jams: [{ data: OFFICIAL }],
      profiles: [{ data: { display_name: "Ben" } }],
      jam_leaders: [{ data: null }, { data: guestRow }],
      ticket_orders: [{ data: [] }, { data: { id: "order-1" } }],
      tickets: [{ data: { qr_token: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" } }],
    });

    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", name: "Sam Guest", email: "Sam@Example.com" });

    expect(res).toMatchObject({ ok: true, leader: { name: "Sam Guest", user_id: null } });
    expect(calls.ticket_orders[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ buyer_user_id: null, buyer_email: "sam@example.com", buyer_name: "Sam Guest" })
    );
    expect(mockMarkAttending).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockSend.mock.calls[0][0].html).toContain("Create an account");
  });

  it("won't add someone who is already leading", async () => {
    const { admin, calls } = adminWith({
      jams: [{ data: OFFICIAL }],
      profiles: [{ data: { display_name: "Maria" } }],
      jam_leaders: [{ data: { id: "leader-1" } }],
    });
    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", userId: "member-1" });
    expect(res).toEqual({ ok: false, status: 409, error: "Already leading this event" });
    expect(calls.ticket_orders).toBeUndefined();
  });

  it("cancels the comp it just made when a concurrent add wins the race", async () => {
    const { admin, calls } = adminWith({
      jams: [{ data: OFFICIAL }],
      profiles: [{ data: { display_name: "Maria" } }],
      jam_leaders: [{ data: null }, { data: null, error: { code: "23505", message: "duplicate" } }],
      ticket_orders: [{ data: [] }, { data: { id: "order-1" } }],
      tickets: [{ data: { qr_token: "x" } }],
    });
    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", userId: "member-1" });
    expect(res).toMatchObject({ ok: false, status: 409 });
    expect(calls.ticket_orders[2].update).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
  });

  it("still adds the leader when the email fails, and says so", async () => {
    mockSend.mockResolvedValue({ error: { message: "rate limited" } });
    const { admin } = adminWith({
      jams: [{ data: OFFICIAL }],
      profiles: [{ data: { display_name: "Maria" } }, { data: null }, { data: [] }],
      jam_leaders: [{ data: null }, { data: LEADER_ROW }],
      ticket_orders: [{ data: [] }, { data: { id: "order-1" } }],
      tickets: [{ data: { qr_token: "x" } }],
    });
    const res = await addJamLeader(admin, { jamId: "jam-1", addedBy: "host-1", userId: "member-1" });
    expect(res).toMatchObject({ ok: true, emailed: false });
  });
});

describe("removeJamLeader", () => {
  it("cancels the comp, gives up the seat and tells the host and whoever added them", async () => {
    const { admin, calls } = adminWith({
      ticket_orders: [{ error: null }, { count: 0 }],
      jams: [{ data: { ...OFFICIAL, host_user_id: "host-1" } }],
      profiles: [{ data: [{ id: "member-1", display_name: "Maria" }] }],
    });

    await removeJamLeader(admin, { ...LEADER_ROW, added_by: "official-2" } as JamLeaderRow, { notifyHost: true });

    expect(calls.ticket_orders[0].update).toHaveBeenCalledWith(expect.objectContaining({ status: "cancelled" }));
    expect(calls.jam_rsvps[0].update).toHaveBeenCalledWith({ status: "cancelled", waitlist_position: null });
    expect(calls.jam_leaders[0].delete).toHaveBeenCalled();
    expect(mockNotify.mock.calls.map((c) => c[0].userId).sort()).toEqual(["host-1", "official-2"]);
    expect(mockNotify.mock.calls[0][0].title).toBe("Maria can't lead at Fall Sing");
  });

  it("keeps the seat of a leader who also bought a ticket", async () => {
    const { admin, calls } = adminWith({ ticket_orders: [{ error: null }, { count: 1 }] });
    await removeJamLeader(admin, LEADER_ROW as JamLeaderRow, { notifyHost: false });
    expect(calls.jam_rsvps).toBeUndefined();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("publicLeaders", () => {
  it("leaves out hidden leaders and never exposes an email", () => {
    const out = publicLeaders([
      { id: "a", user_id: null, name: "Sam", username: null, avatar_url: null, email: "sam@example.com", show_publicly: true, own_ticket_cents: null },
      { id: "b", user_id: "u", name: "Shy", username: "shy", avatar_url: null, email: null, show_publicly: false, own_ticket_cents: null },
    ]);
    expect(out).toEqual([{ id: "a", user_id: null, name: "Sam", username: null, avatar_url: null }]);
  });
});

describe("reseatLeaderAfterRefund", () => {
  const REFUNDED = { jam_id: "jam-1", buyer_user_id: "member-1", buyer_email: null };

  it("leaves a refund alone when the buyer isn't leading", async () => {
    const { admin } = adminWith({ jam_leaders: [{ data: [] }] });
    expect(await reseatLeaderAfterRefund(admin, REFUNDED)).toBe(false);
  });

  it("gives a leader whose own ticket was refunded a leader ticket, and keeps them seated", async () => {
    const { admin, calls } = adminWith({
      jam_leaders: [{ data: [{ ...LEADER_ROW, order_id: null }] }, { error: null }],
      ticket_orders: [{ data: [] }, { data: { id: "order-2" } }],
      tickets: [{ data: { qr_token: "q" } }],
    });
    expect(await reseatLeaderAfterRefund(admin, REFUNDED)).toBe(true);
    expect(calls.ticket_orders[1].insert).toHaveBeenCalledWith(expect.objectContaining({ source: "leader", buyer_user_id: "member-1" }));
    expect(calls.jam_leaders[1].update).toHaveBeenCalledWith({ order_id: "order-2" });
  });

  it("issues nothing when they still hold another ticket they bought", async () => {
    const { admin, calls } = adminWith({
      jam_leaders: [{ data: [{ ...LEADER_ROW, order_id: null }] }],
      ticket_orders: [{ data: [{ buyer_user_id: "member-1", buyer_email: null, amount_cents: 1500 }] }],
    });
    expect(await reseatLeaderAfterRefund(admin, REFUNDED)).toBe(true);
    expect(calls.ticket_orders).toHaveLength(1);
  });
});
