import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoisted so the @/lib/stripe factory above can close over it.
const { mockRetrieve } = vi.hoisted(() => ({ mockRetrieve: vi.fn() }));

vi.mock("@/lib/stripe", () => ({
  SITE_URL: "https://singjam.org",
  stripe: vi.fn(() => ({ checkout: { sessions: { retrieve: mockRetrieve } } })),
}));
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: vi.fn().mockResolvedValue({ error: null }) } },
  FROM_ADDRESS: "SingJam <hello@singjam.org>",
}));
vi.mock("@/lib/ticketFulfilment", () => ({ sendTicketEmail: vi.fn(), fulfilPendingOrder: vi.fn() }));
vi.mock("@/lib/jamAttendance", () => ({ markAttending: vi.fn() }));

import {
  sweepUndeliveredTickets,
  expireStaleTicketHolds,
  reconcileTicketAttendance,
  reconcileLostWebhooks,
} from "./ticketSweep";
import { sendTicketEmail, fulfilPendingOrder } from "@/lib/ticketFulfilment";
import { resend } from "@/lib/resend";
import { markAttending } from "@/lib/jamAttendance";

// Chainable Supabase mock addressed by TABLE, never by call order: the sweep
// touches ticket_orders, jams and system_flags in a sequence that changes with
// every branch, and positional mocks broke on every edit.
function makeAdmin({
  queue = [] as any[],
  queueError = null as any,
  jams = [] as any[],
  flag = null as any,
  rpcData = 0 as any,
  rpcError = null as any,
  seat = null as any,
} = {}) {
  const updates: { table: string; payload: any; id?: string }[] = [];
  const upserts: { table: string; payload: any }[] = [];

  const from = vi.fn((table: string) => {
    let mode: "select" | "update" | "upsert" = "select";
    let payload: any = null;
    let id: string | undefined;
    const obj: any = {};
    const pass = () => vi.fn(() => obj);
    obj.select = pass();
    obj.order = pass();
    obj.limit = pass();
    obj.is = pass();
    obj.in = pass();
    obj.not = pass();
    obj.gte = pass();
    obj.maybeSingle = pass();
    obj.eq = vi.fn((col: string, val: any) => {
      if (col === "id") id = val;
      return obj;
    });
    obj.update = vi.fn((p: any) => { mode = "update"; payload = p; return obj; });
    obj.upsert = vi.fn((p: any) => { mode = "upsert"; payload = p; return obj; });
    obj.then = (resolve: any) => {
      if (mode === "update") { updates.push({ table, payload, id }); return resolve({ data: null, error: null }); }
      if (mode === "upsert") { upserts.push({ table, payload }); return resolve({ data: null, error: null }); }
      if (table === "ticket_orders") return resolve({ data: queue, error: queueError });
      if (table === "jams") return resolve({ data: jams, error: null });
      if (table === "system_flags") return resolve({ data: flag, error: null });
      if (table === "jam_rsvps") return resolve({ data: seat, error: null });
      return resolve({ data: null, error: null });
    };
    return obj;
  });

  const rpc = vi.fn(async () => ({ data: rpcData, error: rpcError }));
  return { admin: { from, rpc } as any, updates, upserts, rpc };
}

const order = (over: Partial<any> = {}) => ({
  id: "o1",
  jam_id: "j1",
  buyer_user_id: null,
  buyer_email: "buyer@example.com",
  buyer_name: "Buyer",
  amount_cents: 1500,
  currency: "usd",
  paid_at: "2026-09-07T20:00:00Z",
  ...over,
});

const sent = () => (resend.emails.send as any).mock.calls;

beforeEach(() => {
  vi.mocked(sendTicketEmail).mockReset();
  vi.mocked(fulfilPendingOrder).mockReset();
  process.env.STRIPE_RESTRICTED_KEY = "rk_test_fake";
  vi.mocked(markAttending).mockReset();
  mockRetrieve.mockReset();
  (resend.emails.send as any).mockReset();
  (resend.emails.send as any).mockResolvedValue({ error: null });
});

describe("sweepUndeliveredTickets", () => {
  it("does nothing when no paid order is missing its ticket", async () => {
    const { admin, updates } = makeAdmin({ queue: [] });
    expect(await sweepUndeliveredTickets(admin)).toEqual({ pending: 0, delivered: 0, failed: 0, alerted: false });
    expect(sendTicketEmail).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(sent()).toHaveLength(0);
  });

  it("retries the send and stamps the order when it succeeds", async () => {
    vi.mocked(sendTicketEmail).mockResolvedValue(true);
    const { admin, updates } = makeAdmin({ queue: [order()], jams: [{ id: "j1", name: "Tuesday Jam" }] });

    const result = await sweepUndeliveredTickets(admin);

    expect(result).toMatchObject({ pending: 1, delivered: 1, failed: 0, alerted: false });
    expect(updates).toHaveLength(1);
    expect(updates[0].table).toBe("ticket_orders");
    expect(updates[0].id).toBe("o1");
    expect(updates[0].payload.ticket_email_sent_at).toBeTruthy();
    // A recovered order is not an emergency — nobody gets woken up.
    expect(sent()).toHaveLength(0);
  });

  it("alerts a human, and does not stamp, when the retry fails too", async () => {
    vi.mocked(sendTicketEmail).mockRejectedValue(new Error("Resend 503"));
    const { admin, updates, upserts } = makeAdmin({ queue: [order()], jams: [{ id: "j1", name: "Tuesday Jam" }] });

    const result = await sweepUndeliveredTickets(admin);

    expect(result).toMatchObject({ pending: 1, delivered: 0, failed: 1, alerted: true });
    // Not stamping is what keeps it in the queue for the next sweep.
    expect(updates).toHaveLength(0);

    expect(sent()).toHaveLength(1);
    const mail = sent()[0][0];
    expect(mail.to).toEqual(["events@singjam.org", "music@singjam.org"]);
    expect(mail.subject).toContain("1 paid ticket");
    expect(mail.html).toContain("Tuesday Jam");
    expect(mail.html).toContain("buyer@example.com");
    expect(mail.html).toContain("Resend 503");
    expect(mail.html).toContain("$15.00");
    expect(mail.html).toContain("o1");
    // Paid time in the event's timezone, not a UTC stamp to decode.
    expect(mail.html).toContain("Sep 7, 2026, 1:00 PM");

    // The flag records which orders were named so the next sweep can tell a
    // repeat from new money at risk.
    expect(upserts).toHaveLength(1);
    expect(upserts[0].table).toBe("system_flags");
    expect(JSON.parse(upserts[0].payload.value).ids).toEqual(["o1"]);
  });

  it("shows the paid time in the event's own timezone", async () => {
    vi.mocked(sendTicketEmail).mockRejectedValue(new Error("down"));
    const { admin } = makeAdmin({
      queue: [order()],
      jams: [{ id: "j1", name: "Tuesday Jam", timezone: "America/New_York" }],
    });

    await sweepUndeliveredTickets(admin);
    expect(sent()[0][0].html).toContain("Sep 7, 2026, 4:00 PM");
  });

  it("reports an order with no address anywhere rather than marking it delivered", async () => {
    vi.mocked(sendTicketEmail).mockResolvedValue(false);
    const { admin, updates } = makeAdmin({
      queue: [order({ buyer_email: null, buyer_user_id: "u1" })],
      jams: [{ id: "j1", name: "Tuesday Jam" }],
    });

    const result = await sweepUndeliveredTickets(admin);

    expect(result).toMatchObject({ delivered: 0, failed: 1, alerted: true });
    expect(updates).toHaveLength(0);
    expect(sent()[0][0].html).toContain("No email address");
  });

  it("stays quiet about orders the last alert already named", async () => {
    vi.mocked(sendTicketEmail).mockRejectedValue(new Error("still down"));
    const { admin } = makeAdmin({
      queue: [order()],
      jams: [{ id: "j1", name: "Tuesday Jam" }],
      flag: { value: JSON.stringify({ at: new Date().toISOString(), ids: ["o1"] }) },
    });

    const result = await sweepUndeliveredTickets(admin);

    expect(result).toMatchObject({ failed: 1, alerted: false });
    expect(sent()).toHaveLength(0);
  });

  it("alerts immediately for a new order even inside the cooldown", async () => {
    vi.mocked(sendTicketEmail).mockRejectedValue(new Error("still down"));
    const { admin } = makeAdmin({
      queue: [order({ id: "o1" }), order({ id: "o2" })],
      jams: [{ id: "j1", name: "Tuesday Jam" }],
      flag: { value: JSON.stringify({ at: new Date().toISOString(), ids: ["o1"] }) },
    });

    const result = await sweepUndeliveredTickets(admin);

    expect(result).toMatchObject({ failed: 2, alerted: true });
    expect(sent()[0][0].subject).toContain("2 paid tickets");
  });

  it("re-alerts about the same order once the cooldown has elapsed", async () => {
    vi.mocked(sendTicketEmail).mockRejectedValue(new Error("still down"));
    const sevenHoursAgo = new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString();
    const { admin } = makeAdmin({
      queue: [order()],
      jams: [{ id: "j1", name: "Tuesday Jam" }],
      flag: { value: JSON.stringify({ at: sevenHoursAgo, ids: ["o1"] }) },
    });

    expect(await sweepUndeliveredTickets(admin)).toMatchObject({ alerted: true });
  });

  it("treats an unreadable flag as never having alerted", async () => {
    vi.mocked(sendTicketEmail).mockRejectedValue(new Error("still down"));
    const { admin } = makeAdmin({
      queue: [order()],
      jams: [{ id: "j1", name: "Tuesday Jam" }],
      flag: { value: "not json" },
    });

    expect(await sweepUndeliveredTickets(admin)).toMatchObject({ alerted: true });
  });

  it("keeps delivering the rest of the batch when one order fails", async () => {
    vi.mocked(sendTicketEmail)
      .mockRejectedValueOnce(new Error("bad address"))
      .mockResolvedValueOnce(true);
    const { admin, updates } = makeAdmin({
      queue: [order({ id: "o1" }), order({ id: "o2" })],
      jams: [{ id: "j1", name: "Tuesday Jam" }],
    });

    const result = await sweepUndeliveredTickets(admin);

    expect(result).toMatchObject({ pending: 2, delivered: 1, failed: 1 });
    expect(updates.map((u) => u.id)).toEqual(["o2"]);
  });

  it("gives up quietly if the queue itself cannot be read", async () => {
    const { admin } = makeAdmin({ queueError: { message: "boom" } });
    expect(await sweepUndeliveredTickets(admin)).toEqual({ pending: 0, delivered: 0, failed: 0, alerted: false });
    expect(sendTicketEmail).not.toHaveBeenCalled();
  });

  it("survives the alert itself failing, without losing the retry queue", async () => {
    vi.mocked(sendTicketEmail).mockRejectedValue(new Error("down"));
    (resend.emails.send as any).mockRejectedValue(new Error("alert down"));
    const { admin, updates } = makeAdmin({ queue: [order()], jams: [{ id: "j1", name: "Tuesday Jam" }] });

    expect(await sweepUndeliveredTickets(admin)).toMatchObject({ failed: 1, alerted: false });
    expect(updates).toHaveLength(0);
  });
});

describe("expireStaleTicketHolds", () => {
  it("returns how many holds it released", async () => {
    const { admin, rpc } = makeAdmin({ rpcData: 3 });
    expect(await expireStaleTicketHolds(admin)).toBe(3);
    expect(rpc).toHaveBeenCalledWith("expire_stale_ticket_orders");
  });

  it("returns 0 when the function errors", async () => {
    const { admin } = makeAdmin({ rpcError: { message: "nope" } });
    expect(await expireStaleTicketHolds(admin)).toBe(0);
  });
});

describe("reconcileTicketAttendance", () => {
  const unseated = { order_id: "o1", jam_id: "j1", user_id: "u1" };

  it("does nothing when every paid buyer already has a seat", async () => {
    const { admin } = makeAdmin({ rpcData: [] });
    expect(await reconcileTicketAttendance(admin)).toEqual({ pending: 0, seated: 0, failed: 0 });
    expect(markAttending).not.toHaveBeenCalled();
  });

  it("seats a paid buyer who was never seated", async () => {
    const { admin, rpc } = makeAdmin({ rpcData: [unseated], seat: { id: "r1" } });

    expect(await reconcileTicketAttendance(admin)).toEqual({ pending: 1, seated: 1, failed: 0 });
    expect(rpc).toHaveBeenCalledWith("ticket_orders_awaiting_attendance");
    expect(markAttending).toHaveBeenCalledWith(admin, "j1", "u1");
  });

  it("counts a failure when the seat still is not there afterwards", async () => {
    // markAttending never checks the errors on its own writes, so it can
    // "succeed" without writing anything. Trusting it would report the same
    // broken order as repaired on every sweep, forever.
    const { admin } = makeAdmin({ rpcData: [unseated], seat: null });

    expect(await reconcileTicketAttendance(admin)).toEqual({ pending: 1, seated: 0, failed: 1 });
  });

  it("keeps going when seating one order throws", async () => {
    vi.mocked(markAttending).mockRejectedValueOnce(new Error("db down"));
    const { admin } = makeAdmin({
      rpcData: [unseated, { order_id: "o2", jam_id: "j2", user_id: "u2" }],
      seat: { id: "r1" },
    });

    // The throw is swallowed per order; the verification query is what decides
    // the count, and this mock reports a seat for both.
    expect(await reconcileTicketAttendance(admin)).toMatchObject({ pending: 2, seated: 2 });
    expect(markAttending).toHaveBeenCalledTimes(2);
  });

  it("gives up quietly when the work-queue function errors", async () => {
    const { admin } = makeAdmin({ rpcError: { message: "no such function" } });
    expect(await reconcileTicketAttendance(admin)).toEqual({ pending: 0, seated: 0, failed: 0 });
    expect(markAttending).not.toHaveBeenCalled();
  });
});

describe("reconcileLostWebhooks", () => {
  const lost = (over: Partial<any> = {}) => ({
    id: "o1",
    status: "pending",
    stripe_checkout_session_id: "cs_test_1",
    ...over,
  });
  const session = (over: Partial<any> = {}) => ({
    payment_status: "paid",
    amount_total: 1576,
    payment_intent: "pi_1",
    ...over,
  });

  it("fulfils a pending order Stripe says was paid", async () => {
    // The whole point: the webhook never arrived, so nothing else would have
    // noticed this order.
    const { admin } = makeAdmin({ queue: [lost()] });
    mockRetrieve.mockResolvedValue(session());
    vi.mocked(fulfilPendingOrder).mockResolvedValue({ id: "o1" } as any);

    const r = await reconcileLostWebhooks(admin);
    expect(r).toMatchObject({ checked: 1, skipped: 0, recovered: 1, stranded: 0, failed: 0 });
    // Fulfilment must go through the same path the webhook uses, with Stripe's
    // own total rather than our pre-discount subtotal.
    expect(fulfilPendingOrder).toHaveBeenCalledWith(admin, "o1", {
      amountCents: 1576,
      paymentIntentId: "pi_1",
    });
  });

  it("leaves an unpaid session alone", async () => {
    const { admin } = makeAdmin({ queue: [lost()] });
    mockRetrieve.mockResolvedValue(session({ payment_status: "unpaid" }));

    const r = await reconcileLostWebhooks(admin);
    expect(r).toMatchObject({ checked: 1, recovered: 0 });
    expect(fulfilPendingOrder).not.toHaveBeenCalled();
  });

  it("never treats an unreadable session as unpaid", async () => {
    // Stripe down, or a session from the other mode. Counting that as "not
    // paid" would quietly abandon a real sale.
    const { admin } = makeAdmin({ queue: [lost()] });
    mockRetrieve.mockRejectedValue(new Error("connection reset"));

    const r = await reconcileLostWebhooks(admin);
    expect(r).toMatchObject({ checked: 0, recovered: 0, failed: 1 });
    expect(fulfilPendingOrder).not.toHaveBeenCalled();
  });

  it("refuses to re-issue an already-expired order, and reports it", async () => {
    // The hold lapsed, so the stock may have been resold — re-issuing could
    // oversell a capped tier. That is a person's decision.
    const { admin } = makeAdmin({ queue: [lost({ status: "expired" })] });
    mockRetrieve.mockResolvedValue(session());

    const r = await reconcileLostWebhooks(admin);
    expect(r).toMatchObject({ checked: 1, recovered: 0, stranded: 1 });
    expect(fulfilPendingOrder).not.toHaveBeenCalled();
  });

  it("counts a late webhook winning the race as failed, not recovered", async () => {
    // fulfilPendingOrder returns null when the status guard no longer matches,
    // which is exactly what makes racing Stripe safe.
    const { admin } = makeAdmin({ queue: [lost()] });
    mockRetrieve.mockResolvedValue(session());
    vi.mocked(fulfilPendingOrder).mockResolvedValue(null as any);

    const r = await reconcileLostWebhooks(admin);
    expect(r).toMatchObject({ recovered: 0, failed: 1 });
  });

  it("handles a session whose payment_intent is an expanded object", async () => {
    const { admin } = makeAdmin({ queue: [lost()] });
    mockRetrieve.mockResolvedValue(session({ payment_intent: { id: "pi_expanded" } }));
    vi.mocked(fulfilPendingOrder).mockResolvedValue({ id: "o1" } as any);

    await reconcileLostWebhooks(admin);
    expect(fulfilPendingOrder).toHaveBeenCalledWith(
      admin,
      "o1",
      expect.objectContaining({ paymentIntentId: "pi_expanded" })
    );
  });

  it("skips a session from Stripe's other mode instead of erroring on it", async () => {
    // The table holds both modes; a key can only read its own. Retrieving the
    // wrong one raises "No such checkout.session", which is not a failure —
    // and logging it as one produced ten errors every ten minutes.
    process.env.STRIPE_RESTRICTED_KEY = "rk_live_fake";
    const { admin } = makeAdmin({ queue: [lost({ stripe_checkout_session_id: "cs_test_old" })] });

    const r = await reconcileLostWebhooks(admin);
    expect(r).toMatchObject({ checked: 0, skipped: 1, failed: 0 });
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("reads sessions from its own mode", async () => {
    process.env.STRIPE_RESTRICTED_KEY = "rk_live_fake";
    const { admin } = makeAdmin({ queue: [lost({ stripe_checkout_session_id: "cs_live_mine" })] });
    mockRetrieve.mockResolvedValue(session());
    vi.mocked(fulfilPendingOrder).mockResolvedValue({ id: "o1" } as any);

    const r = await reconcileLostWebhooks(admin);
    expect(r).toMatchObject({ checked: 1, skipped: 0, recovered: 1 });
  });

  it("does nothing and reports nothing when the queue is empty", async () => {
    const { admin } = makeAdmin({ queue: [] });
    expect(await reconcileLostWebhooks(admin)).toEqual({
      checked: 0, skipped: 0, recovered: 0, stranded: 0, failed: 0,
    });
    expect(mockRetrieve).not.toHaveBeenCalled();
  });

  it("gives up quietly if the queue query fails", async () => {
    // A failed query really does return data: null, so keep that shape.
    const { admin } = makeAdmin({ queue: null as any, queueError: { message: "boom" } });
    expect(await reconcileLostWebhooks(admin)).toMatchObject({ checked: 0, recovered: 0 });
  });
});
