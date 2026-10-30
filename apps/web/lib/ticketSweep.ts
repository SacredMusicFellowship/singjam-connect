import type { SupabaseClient } from "@supabase/supabase-js";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { SITE_URL, stripe } from "@/lib/stripe";
import { fulfilPendingOrder, sendTicketEmail, type PaidOrder } from "@/lib/ticketFulfilment";
import { markAttending } from "@/lib/jamAttendance";
import { ticketDeliveryFailedEmailHtml, type FailedTicketDelivery } from "@/emails/ticket-delivery-failed";
import { jamPath } from "@singjam/core";

// The failure Stripe cannot see. It watches for our endpoint erroring, not for
// it returning 200 while the ticket never went out — which is exactly what
// happens when the confirmation email throws, because fulfilment deliberately
// swallows that rather than failing a webhook for an order that is correctly
// paid. Money taken, no ticket, and nobody told.
//
// Migration 154 built the detector and nothing read it: a partial index on
// (status = 'paid' and ticket_email_sent_at is null). This is its reader. It
// retries first, because a transient Resend outage is the likeliest cause and a
// retry fixes it outright, and only alerts a human for what it cannot deliver.

// Both monitored role inboxes rather than one: an undelivered ticket is a
// money-taken problem, so it should not be waiting behind one person's inbox.
const ALERT_TO = ["events@singjam.org", "music@singjam.org"];
const ALERT_FLAG = "ticket_delivery_failed_notified";
const ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000;

// A batch drain, not a rendered list: the sweep runs every ten minutes, so
// anything past the cap is picked up on the next pass. More than a handful here
// is already the emergency the alert is for.
const SWEEP_LIMIT = 50;

const ORDER_COLS =
  "id, jam_id, buyer_user_id, buyer_email, buyer_name, amount_cents, currency, paid_at";

type UndeliveredOrder = PaidOrder & { paid_at: string | null };

export type TicketSweepResult = {
  pending: number;
  delivered: number;
  failed: number;
  alerted: boolean;
};

const formatAmount = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

// Shown in the event's own timezone: whoever reads this is about to talk to a
// buyer about a specific door, and a UTC stamp makes them do the arithmetic.
const formatPaidAt = (paidAt: string | null, timezone: string | null) => {
  if (!paidAt) return "unknown";
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone ?? "America/Los_Angeles",
    }).format(new Date(paidAt));
  } catch {
    return paidAt;
  }
};

// Alerts once per situation rather than once per sweep: a repeat every ten
// minutes would train the recipient to ignore it. Any order the last alert did
// not name is new money at risk, so that always sends immediately; the cooldown
// only governs re-nagging about the same orders.
async function alertUndelivered(admin: SupabaseClient, failures: FailedTicketDelivery[]): Promise<boolean> {
  const { data } = await admin.from("system_flags").select("value").eq("key", ALERT_FLAG).maybeSingle();

  let alreadyNamed: string[] = [];
  let lastAlertAt = 0;
  try {
    const parsed = data?.value ? JSON.parse(data.value) : null;
    if (parsed) {
      alreadyNamed = Array.isArray(parsed.ids) ? parsed.ids : [];
      lastAlertAt = Date.parse(parsed.at) || 0;
    }
  } catch {
    // Unreadable flag: treat as never alerted rather than staying silent.
  }

  const hasNewOrder = failures.some((f) => !alreadyNamed.includes(f.orderId));
  if (!hasNewOrder && Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return false;

  const now = new Date().toISOString();
  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: ALERT_TO,
    subject: `Action required: ${failures.length} paid ticket${failures.length === 1 ? "" : "s"} not delivered`,
    html: ticketDeliveryFailedEmailHtml(failures),
  });
  // Unsent means unrecorded, so the next sweep tries the alert again.
  if (error) return false;
  await admin.from("system_flags").upsert({
    key: ALERT_FLAG,
    value: JSON.stringify({ at: now, ids: failures.map((f) => f.orderId) }),
    updated_at: now,
  });
  return true;
}

export async function sweepUndeliveredTickets(admin: SupabaseClient): Promise<TicketSweepResult> {
  const idle: TicketSweepResult = { pending: 0, delivered: 0, failed: 0, alerted: false };

  const { data, error } = await admin
    .from("ticket_orders")
    .select(ORDER_COLS)
    .eq("status", "paid")
    // A leader's comp has its own email (lib/jamLeaders.ts); the purchase
    // receipt would tell them they paid $0.00.
    .eq("source", "purchase")
    .is("ticket_email_sent_at", null)
    .order("paid_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(SWEEP_LIMIT);

  if (error) {
    console.error(`[ticketSweep] queue query failed: ${error.message}`);
    return idle;
  }

  const orders = (data ?? []) as UndeliveredOrder[];
  if (orders.length === 0) return idle;

  // One lookup for the whole batch: the alert is useless without event names.
  const { data: jams } = await admin
    .from("jams")
    .select("id, short_code, name, timezone")
    .in("id", [...new Set(orders.map((o) => o.jam_id))]);
  const jamsById = new Map((jams ?? []).map((j: any) => [j.id, j]));

  const failures: FailedTicketDelivery[] = [];
  let delivered = 0;

  for (const order of orders) {
    const jam = jamsById.get(order.jam_id);
    const describe = (reason: string): FailedTicketDelivery => ({
      orderId: order.id,
      jamName: jam?.name ?? "an event",
      jamUrl: `${SITE_URL}${jamPath({ id: order.jam_id, short_code: jam?.short_code })}`,
      buyerEmail: order.buyer_email,
      amountLabel: formatAmount(order.amount_cents, order.currency),
      paidLabel: formatPaidAt(order.paid_at, jam?.timezone ?? null),
      reason,
    });

    try {
      if (await sendTicketEmail(admin, order)) {
        const now = new Date().toISOString();
        await admin
          .from("ticket_orders")
          .update({ ticket_email_sent_at: now, updated_at: now })
          .eq("id", order.id);
        delivered++;
        continue;
      }
      // No address anywhere on the order. Retrying will never help, so this
      // one only ever leaves the queue by hand.
      failures.push(describe("No email address on the order or on the buyer's account."));
    } catch (err) {
      failures.push(describe(err instanceof Error ? err.message : String(err)));
    }
  }

  let alerted = false;
  if (failures.length > 0) {
    for (const f of failures) {
      console.error(`[ticketSweep] ticket undelivered for order ${f.orderId}: ${f.reason}`);
    }
    try {
      alerted = await alertUndelivered(admin, failures);
    } catch (err) {
      console.error("[ticketSweep] alert send failed:", err);
    }
  }

  return { pending: orders.length, delivered, failed: failures.length, alerted };
}

// Bookkeeping, not correctness — ticket_type_sold_count already ignores elapsed
// holds. But nothing has ever called this function, so an abandoned checkout
// whose expiry webhook never landed stays "pending" forever and shows on the
// host page as held stock. Production still had one from launch week.
export async function expireStaleTicketHolds(admin: SupabaseClient): Promise<number> {
  const { data, error } = await admin.rpc("expire_stale_ticket_orders");
  if (error) {
    console.error(`[ticketSweep] expire_stale_ticket_orders failed: ${error.message}`);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export type AttendanceReconcileResult = { pending: number; seated: number; failed: number };

// The other half of the same problem the email sweep solves, for the other
// thing fulfilment does. `fulfilPendingOrder` flips the order to paid and only
// then seats the buyer, so the `.eq("status","pending")` guard that makes
// Stripe's redeliveries safe gives everything after it exactly one attempt —
// and `markAttending` swallows the errors on its own writes, so a failure
// leaves no trace at all. Buyer paid, ticket in hand, not on the guest list and
// no seat on the set list.
//
// Migration 161 derives the queue (a paid member order with no jam_rsvps row of
// any kind) and explains why it keys on the absence of the row rather than on
// its status: a ticket holder can cancel deliberately, and re-seating them
// every ten minutes would be worse than the bug.
export async function reconcileTicketAttendance(admin: SupabaseClient): Promise<AttendanceReconcileResult> {
  const { data, error } = await admin.rpc("ticket_orders_awaiting_attendance");
  if (error) {
    console.error(`[ticketSweep] ticket_orders_awaiting_attendance failed: ${error.message}`);
    return { pending: 0, seated: 0, failed: 0 };
  }

  const rows = (data ?? []) as { order_id: string; jam_id: string; user_id: string }[];
  let seated = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await markAttending(admin, row.jam_id, row.user_id);
    } catch (err) {
      console.error(`[ticketSweep] seating order ${row.order_id} threw:`, err);
    }

    // markAttending never inspects the errors on its own writes, so "it did not
    // throw" is not evidence that the row exists. Check, or a permanently
    // failing insert would be reported as repaired on every sweep forever.
    const { data: seat } = await admin
      .from("jam_rsvps")
      .select("id")
      .eq("jam_id", row.jam_id)
      .eq("user_id", row.user_id)
      .maybeSingle();

    if (seat) {
      seated++;
    } else {
      failed++;
      console.error(
        `[ticketSweep] order ${row.order_id} is paid but its buyer is still not seated on jam ${row.jam_id}`,
      );
    }
  }

  return { pending: rows.length, seated, failed };
}

// ---------------------------------------------------------------------------
// The failure nobody was watching for: Stripe took the money and its webhook
// never arrived.
// ---------------------------------------------------------------------------
//
// The webhook is the only thing that fulfils an order, so a delivery that never
// lands leaves the buyer paid, unticketed, un-emailed and off the guest list —
// and neither existing sweep can see it. sweepUndeliveredTickets looks for
// `paid` orders with no email, and reconcileTicketAttendance for `paid` orders
// with no seat; a lost webhook leaves the order `pending`, so it is invisible
// to both.
//
// Worse, we actively close it off. expireStaleTicketHolds marks any lapsed
// `pending` order `expired`, so within ten minutes of the hold running out the
// order stops looking pending at all. **That is why this runs before it** — see
// the ordering in netlify/functions/flush-email-outbox.ts, which is load-bearing
// rather than incidental.
//
// It was never observed in production, and the live webhook has since been
// proven in both directions. This exists because the confirmation page now
// tells a buyer "You're in!" the moment Stripe confirms, which is right for
// them but removed the symptom that would have made a lost webhook obvious.
//
// Stripe is the authority here, not us: an order is only fulfilled when Stripe
// itself reports payment_status 'paid'. Fulfilment goes through the very same
// fulfilPendingOrder the webhook calls, whose `.eq("status","pending")` guard
// makes a double delivery a no-op — so this racing a late webhook is safe.

/** Bounded so a sweep cannot turn into an unbounded pile of Stripe calls. */
const RECONCILE_LIMIT = 25;
/** Anything older than this is a support conversation, not a sweep. */
const RECONCILE_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

export type LostWebhookResult = {
  /** Orders whose session was checked against Stripe. */
  checked: number;
  /** Sessions belonging to Stripe's other mode, which this key cannot read. */
  skipped: number;
  /** Paid at Stripe, unfulfilled here, now fulfilled. */
  recovered: number;
  /** Paid at Stripe but already marked expired — needs a human. */
  stranded: number;
  /** Session could not be read, or fulfilment refused. */
  failed: number;
};

export async function reconcileLostWebhooks(admin: SupabaseClient): Promise<LostWebhookResult> {
  const result: LostWebhookResult = { checked: 0, skipped: 0, recovered: 0, stranded: 0, failed: 0 };

  // A key can only read sessions from its own mode, and the table holds both:
  // production accumulated test-mode orders while this flow was being built.
  // Retrieving those raises "No such checkout.session", which is not a failure
  // and must not be logged as one — left unfiltered it produced ten errors per
  // sweep, every ten minutes, which is exactly how a real failure gets missed.
  const readablePrefix = (process.env.STRIPE_RESTRICTED_KEY ?? "").includes("_live_")
    ? "cs_live_"
    : "cs_test_";

  // `expired` is included for detection only. A hold that lapsed may have had
  // its stock resold, so re-issuing could oversell a capped tier — that is a
  // judgement call for a person, not a sweep. Going forward this should stay
  // empty, because reconciling runs before the expiry step.
  const { data: orders, error } = await admin
    .from("ticket_orders")
    .select("id, status, stripe_checkout_session_id")
    .in("status", ["pending", "expired"])
    .not("stripe_checkout_session_id", "is", null)
    .is("paid_at", null)
    .gte("created_at", new Date(Date.now() - RECONCILE_LOOKBACK_MS).toISOString())
    .order("created_at", { ascending: true })
    .limit(RECONCILE_LIMIT);

  if (error) {
    console.error(`[ticketSweep] lost-webhook queue failed: ${error.message}`);
    return result;
  }

  for (const order of orders ?? []) {
    if (!order.stripe_checkout_session_id!.startsWith(readablePrefix)) {
      result.skipped += 1;
      continue;
    }
    let session;
    try {
      session = await stripe().checkout.sessions.retrieve(order.stripe_checkout_session_id!);
    } catch (err) {
      // Stripe unreachable, or a session from the other mode. Never treat an
      // unreadable session as an unpaid one — just leave it for the next pass.
      console.error(`[ticketSweep] could not read session for order ${order.id}:`, err);
      result.failed += 1;
      continue;
    }
    result.checked += 1;
    if (session.payment_status !== "paid") continue;

    if (order.status === "expired") {
      // Money taken and the hold already released. Loud on purpose: this should
      // be unreachable, and if it ever fires somebody has paid for nothing.
      console.error(
        `[ticketSweep] STRANDED PAID ORDER ${order.id} — Stripe says paid but the hold was expired. ` +
          `Needs a human: re-issue or refund.`
      );
      result.stranded += 1;
      continue;
    }

    const fulfilled = await fulfilPendingOrder(admin, order.id, {
      amountCents: session.amount_total ?? null,
      paymentIntentId:
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : session.payment_intent?.id ?? null,
    });
    if (fulfilled) {
      // Worth a line in the log even on success: it means a webhook was lost.
      console.error(`[ticketSweep] recovered lost webhook for order ${order.id}`);
      result.recovered += 1;
    } else {
      // A webhook landed between the query and here. The guard did its job.
      result.failed += 1;
    }
  }

  return result;
}
