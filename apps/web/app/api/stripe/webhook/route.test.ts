import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAdminFrom, mockConstructEvent, mockSend, mockGetUserById, mockSyncContact, mockReseat } = vi.hoisted(() => ({
  mockReseat: vi.fn().mockResolvedValue(false),
  mockSyncContact: vi.fn().mockResolvedValue([]),
  mockAdminFrom: vi.fn(),
  mockConstructEvent: vi.fn(),
  mockSend: vi.fn().mockResolvedValue({}),
  mockGetUserById: vi.fn().mockResolvedValue({ data: { user: { email: "member@singjam.org" } } }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: vi.fn(() => ({
    from: mockAdminFrom,
    auth: { admin: { getUserById: mockGetUserById } },
  })),
}));
vi.mock("@/lib/stripe", () => ({
  // A factory, matching the lazy client in lib/stripe.ts.
  stripe: () => ({ webhooks: { constructEvent: mockConstructEvent } }),
  SITE_URL: "https://singjam.org",
}));
vi.mock("@/lib/resend", () => ({
  resend: { emails: { send: mockSend } },
  FROM_ADDRESS: "test@singjam.org",
  EVENTS_FROM_ADDRESS: "events-test@singjam.org",
}));
vi.mock("@/emails/ticket-confirmation", () => ({
  ticketConfirmationHtml: vi.fn(() => "<html>"),
}));
vi.mock("@/lib/activecampaign", () => ({ syncContact: mockSyncContact }));
vi.mock("@/lib/jamLeaders", () => ({ reseatLeaderAfterRefund: mockReseat }));

import { POST } from "./route";

function chain(result: any) {
  const c: any = {};
  for (const m of ["select", "eq", "update", "insert"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockResolvedValue(result);
  c.maybeSingle = vi.fn().mockResolvedValue(result);
  c.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return c;
}

function throwingChain(message: string) {
  const c: any = {};
  for (const m of ["select", "eq", "update", "insert"]) {
    c[m] = vi.fn().mockReturnValue(c);
  }
  c.single = vi.fn().mockRejectedValue(new Error(message));
  c.maybeSingle = vi.fn().mockRejectedValue(new Error(message));
  c.then = (_r: any, reject: any) => Promise.reject(new Error(message)).catch(reject);
  return c;
}

// Chains are addressed by the table they were opened on, not by position.
// Positional indices broke every time a query was added anywhere upstream —
// including in code the webhook merely calls — and the failure looked like a
// logic bug rather than a bookkeeping one.
function chainFor(table: string, nth = 0) {
  const hits = mockAdminFrom.mock.calls
    .map((c, i) => (c[0] === table ? i : -1))
    .filter((i) => i >= 0);
  const idx = hits[nth];
  if (idx == null) throw new Error(`no .from("${table}") call #${nth}`);
  return mockAdminFrom.mock.results[idx].value;
}

const ORDER_ID = "order-1";
const JAM_ID = "jam-1";
const BUYER_ID = "user-1";

function paidOrder(over: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    jam_id: JAM_ID,
    buyer_user_id: BUYER_ID,
    buyer_email: "buyer@example.com",
    buyer_name: "Buyer",
    amount_cents: 3000,
    currency: "usd",
    ticket_email_sent_at: null,
    ...over,
  };
}

// The confirmation email reads the jam and the order's tickets, then stamps the
// order so a redelivery can't send twice.
function emailChains() {
  mockAdminFrom
    .mockReturnValueOnce(chain({ data: { name: "Winter Sing", starts_at: null } })) // jams
    .mockReturnValueOnce(chain({ data: [{ qr_token: "abc-def", ticket_types: { name: "General" } }] })) // tickets
    .mockReturnValueOnce(chain({ data: null })) // linked set for the email's set link
    .mockReturnValueOnce(chain({ error: null })); // stamp ticket_email_sent_at
}

function makeReq(signed = true) {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: signed ? { "stripe-signature": "sig" } : {},
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks does NOT drain mockReturnValueOnce queues, nor does it drop
  // implementations. Different events consume different numbers of chains, and
  // the "resend down" test leaves a rejection behind — without these resets one
  // test's leftovers silently become the next test's behaviour.
  mockAdminFrom.mockReset();
  mockSend.mockReset();
  mockSend.mockResolvedValue({});
  mockSyncContact.mockReset();
  mockSyncContact.mockResolvedValue([]);
});

describe("POST /api/stripe/webhook", () => {
  it("rejects a request with no signature header", async () => {
    const res = await POST(makeReq(false));
    expect(res.status).toBe(400);
    expect(mockConstructEvent).not.toHaveBeenCalled();
  });

  it("rejects a forged payload whose signature does not verify", async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("marks the order paid and records attendance on checkout.session.completed", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: "paid",
          payment_intent: "pi_1",
          metadata: { order_id: ORDER_ID },
        },
      },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder() })); // order update
    emailChains();
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null })) // existing rsvp lookup
      .mockReturnValueOnce(chain({ error: null })) // rsvp insert
      .mockReturnValueOnce(chain({ data: null })); // linked set lookup — none

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    const orderChain = chainFor("ticket_orders");
    expect(orderChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid", stripe_payment_intent_id: "pi_1" })
    );
    // The pending guard is what makes redelivery a no-op.
    expect(orderChain.eq).toHaveBeenCalledWith("status", "pending");

    const rsvpChain = chainFor("jam_rsvps", 1);
    expect(rsvpChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ jam_id: JAM_ID, user_id: BUYER_ID, status: "attending" })
    );

    // The buyer gets their ticket.
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ to: "buyer@example.com" });
  });

  it("fulfils a guest order without trying to write an attendance row", async () => {
    // jam_rsvps.user_id is NOT NULL and references profiles, so a guest order
    // has nothing to attach attendance to — the order and tickets are the record.
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(
      chain({ data: paidOrder({ buyer_user_id: null, buyer_email: "guest@example.com" }) })
    );
    emailChains();

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockAdminFrom.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" })
    );
    // The guest still gets their ticket — it's their only copy.
    expect(mockSend.mock.calls[0][0]).toMatchObject({ to: "guest@example.com" });
    // Order update + 3 email calls, and nothing more: no jam_rsvps work.
    expect(mockAdminFrom.mock.calls.filter((c) => c[0] === "jam_rsvps")).toHaveLength(0);
  });

  it("records what Stripe charged, not our pre-discount total", async () => {
    // A promo code means amount_total < the tier total we computed at checkout.
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          payment_status: "paid",
          payment_intent: "pi_1",
          amount_total: 2400, // $30 order with 20% off
          metadata: { order_id: ORDER_ID },
        },
      },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder({ buyer_user_id: null }) }));
    emailChains();

    await POST(makeReq());
    expect(mockAdminFrom.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid", amount_cents: 2400 })
    );
  });

  it("leaves the amount alone when Stripe sends no total", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder({ buyer_user_id: null }) }));
    emailChains();

    await POST(makeReq());
    // Better to keep our computed figure than overwrite it with undefined.
    expect(mockAdminFrom.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.not.objectContaining({ amount_cents: expect.anything() })
    );
  });

  it("does not re-send the ticket when Stripe redelivers", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    // A stamped order means the email already went out.
    mockAdminFrom.mockReturnValueOnce(
      chain({ data: paidOrder({ buyer_user_id: null, ticket_email_sent_at: "2026-08-07T00:00:00Z" }) })
    );

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not stamp the order as delivered when there is no address to send to", async () => {
    // A member with no email on their auth record. Stamping would drop the
    // order out of the sweeper's queue and nobody would ever learn the ticket
    // was never sent.
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockGetUserById.mockResolvedValueOnce({ data: { user: {} } });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder({ buyer_email: null }) })); // order update
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null })) // profiles lookup inside sendTicketEmail
      .mockReturnValueOnce(chain({ data: null })) // existing rsvp lookup
      .mockReturnValueOnce(chain({ error: null })) // rsvp insert
      .mockReturnValueOnce(chain({ data: null })); // linked set lookup

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockSend).not.toHaveBeenCalled();

    // Exactly one ticket_orders write: the paid transition, no email stamp.
    const orderWrites = mockAdminFrom.mock.calls.filter((c) => c[0] === "ticket_orders");
    expect(orderWrites).toHaveLength(1);
  });

  it("keeps the sale and returns 200 when seating the buyer fails", async () => {
    // Throwing here used to give Stripe a 500 on a sale that had completed.
    // Its retry could never help: the status guard means a redelivery returns
    // early, so the retry succeeded having done nothing and the buyer was
    // never seated. Now swallowed, because reconcileTicketAttendance repairs
    // the missing seat from migration 161's queue within ten minutes.
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder() })); // order update
    emailChains();
    mockAdminFrom.mockReturnValueOnce(throwingChain("jam_rsvps unreachable"));

    const res = await POST(makeReq());
    expect(res.status).toBe(200);

    // The money and the ticket are both accounted for; only the seat is missing.
    expect(chainFor("ticket_orders").update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" })
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it("adds an opted-in guest to the mailing list once the sale is real", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(
      chain({ data: paidOrder({ buyer_user_id: null, buyer_name: "Ada Lovelace", marketing_opt_in: true }) })
    );
    emailChains();

    await POST(makeReq());

    expect(mockSyncContact).toHaveBeenCalledTimes(1);
    // Checkout has one Name field, so it is split rather than dumped into first.
    // No account, so no SingJam App User tag.
    expect(mockSyncContact.mock.calls[0]).toEqual([
      "buyer@example.com",
      { firstName: "Ada", lastName: "Lovelace" },
      { tag: false },
    ]);
  });

  it("does not add a guest who left the box unticked", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder({ buyer_user_id: null, marketing_opt_in: false }) }));
    emailChains();

    await POST(makeReq());
    expect(mockSyncContact).not.toHaveBeenCalled();
  });

  it("does not re-add a member, who subscribed when they made an account", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder({ marketing_opt_in: true }) }));
    emailChains();
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null }))
      .mockReturnValueOnce(chain({ error: null }))
      .mockReturnValueOnce(chain({ data: null }));

    await POST(makeReq());
    expect(mockSyncContact).not.toHaveBeenCalled();
  });

  it("still fulfils the order when the mailing list sync fails", async () => {
    // An ActiveCampaign outage must not fail a webhook for a paid order.
    mockSyncContact.mockRejectedValueOnce(new Error("AC down"));
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder({ buyer_user_id: null, marketing_opt_in: true }) }));
    emailChains();

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(chainFor("ticket_orders").update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" })
    );
  });

  it("still marks the order paid when the confirmation email fails", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder({ buyer_user_id: null }) }));
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { name: "Winter Sing", starts_at: null } }))
      .mockReturnValueOnce(chain({ data: [{ qr_token: "abc", ticket_types: { name: "General" } }] }));
    mockSend.mockRejectedValueOnce(new Error("resend down"));

    const res = await POST(makeReq());
    // A mail outage must not fail the webhook — Stripe would retry an already
    // correctly-paid order. The unstamped row is the sweeper's work queue.
    expect(res.status).toBe(200);
    expect(mockAdminFrom.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "paid" })
    );
  });

  it("refunds a guest order without touching attendance", async () => {
    mockConstructEvent.mockReturnValue({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", amount: 3000, amount_refunded: 3000 } },
    });
    mockAdminFrom.mockReturnValueOnce(
      chain({ data: { id: ORDER_ID, jam_id: JAM_ID, buyer_user_id: null } })
    );

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });

  it("does not fulfil when a delayed payment method reports completed but unpaid", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "unpaid", metadata: { order_id: ORDER_ID } } },
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("is a no-op on redelivery once the order is no longer pending", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    // The guarded update matches nothing the second time around.
    mockAdminFrom.mockReturnValueOnce(chain({ data: null }));

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    // No RSVP writes followed.
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });

  it("promotes an existing waitlist row instead of inserting a duplicate", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder() }));
    emailChains();
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: "rsvp-9" } })) // already has a row
      .mockReturnValueOnce(chain({ error: null }))
      .mockReturnValueOnce(chain({ data: null })); // linked set lookup — none

    await POST(makeReq());
    const rsvpChain = chainFor("jam_rsvps", 1);
    expect(rsvpChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "attending", waitlist_position: null })
    );
    expect(rsvpChain.insert).not.toHaveBeenCalled();
  });

  it("seats the buyer at the jam's set list so they can add songs", async () => {
    // The point of the whole feature: a ticket is what earns edit access to an
    // official event's set. Anyone may read it; only ticket holders may add.
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder() }));
    emailChains();
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null })) // existing rsvp lookup
      .mockReturnValueOnce(chain({ error: null })) // rsvp insert
      .mockReturnValueOnce(chain({ data: { id: "set-1", owner_user_id: "host-9" } })) // linked set
      .mockReturnValueOnce(chain({ data: null })) // not already a collaborator
      .mockReturnValueOnce(chain({ error: null })); // collaborator insert

    await POST(makeReq());

    const collabChain = chainFor("set_collaborators", 1);
    expect(collabChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ set_id: "set-1", user_id: BUYER_ID, status: "accepted" })
    );
  });

  it("does not duplicate set access for a buyer who already collaborates", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { payment_status: "paid", payment_intent: "pi_1", metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: paidOrder() }));
    emailChains();
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: null }))
      .mockReturnValueOnce(chain({ error: null }))
      .mockReturnValueOnce(chain({ data: { id: "set-1", owner_user_id: "host-9" } }))
      .mockReturnValueOnce(chain({ data: { id: "collab-1" } })); // already there

    await POST(makeReq());

    // Only 8 calls: no insert followed the existing-collaborator lookup.
    // Only the existing-collaborator lookup ran; no insert followed it.
    expect(mockAdminFrom.mock.calls.filter((c) => c[0] === "set_collaborators")).toHaveLength(1);
  });

  it("expires the order and releases the hold on checkout.session.expired", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.expired",
      data: { object: { metadata: { order_id: ORDER_ID } } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ error: null }));

    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    const c = mockAdminFrom.mock.results[0].value;
    expect(c.update).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
    expect(c.eq).toHaveBeenCalledWith("status", "pending");
  });

  it("voids the order and cancels attendance on a full refund", async () => {
    mockConstructEvent.mockReturnValue({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", amount: 3000, amount_refunded: 3000 } },
    });
    mockAdminFrom
      .mockReturnValueOnce(chain({ data: { id: ORDER_ID, jam_id: JAM_ID, buyer_user_id: BUYER_ID } }))
      .mockReturnValueOnce(chain({ error: null }));

    await POST(makeReq());
    expect(mockAdminFrom.mock.results[0].value.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "refunded" })
    );
    expect(chainFor("jam_rsvps").update).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled" })
    );
  });

  it("keeps a leader seated when the ticket they bought is refunded", async () => {
    mockReseat.mockResolvedValueOnce(true);
    mockConstructEvent.mockReturnValue({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", amount: 3000, amount_refunded: 3000 } },
    });
    mockAdminFrom.mockReturnValueOnce(chain({ data: { id: ORDER_ID, jam_id: JAM_ID, buyer_user_id: BUYER_ID } }));

    await POST(makeReq());
    expect(mockReseat).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ buyer_user_id: BUYER_ID }));
    expect(mockAdminFrom).toHaveBeenCalledTimes(1);
  });

  it("leaves tickets valid on a partial refund", async () => {
    mockConstructEvent.mockReturnValue({
      type: "charge.refunded",
      data: { object: { payment_intent: "pi_1", amount: 3000, amount_refunded: 500 } },
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });

  it("does not void a ticket when a dispute is opened", async () => {
    mockConstructEvent.mockReturnValue({
      type: "charge.dispute.created",
      data: { object: { payment_intent: "pi_1" } },
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(mockAdminFrom).not.toHaveBeenCalled();
  });
});
