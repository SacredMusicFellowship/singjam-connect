import { schedule } from "@netlify/functions";
import { createClient } from "@supabase/supabase-js";
import { resend } from "../../lib/resend";
import { flushEmailOutbox, sweepPendingWelcomes } from "../../lib/emailOutbox";
import {
  expireStaleTicketHolds,
  reconcileLostWebhooks,
  reconcileTicketAttendance,
  sweepUndeliveredTickets,
} from "../../lib/ticketSweep";

export const handler = schedule("*/10 * * * *", async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Two independent sweeps, each in its own try: a Resend outage takes out the
  // welcome flush, and that must not be the reason a paid ticket goes unnoticed.
  let failed = false;

  try {
    // Backstop the profile-save send first, then retry whatever is still
    // pending (including anything the sweep just enqueued).
    await sweepPendingWelcomes(admin, resend);
    await flushEmailOutbox(admin, resend);
  } catch (err) {
    console.error("flush-email-outbox:", err);
    failed = true;
  }

  try {
    // BEFORE expireStaleTicketHolds, and that order is load-bearing. A lost
    // Stripe webhook leaves an order `pending`; expiring it first would stamp
    // it `expired` and take it out of this reconciler's reach, turning a
    // recoverable sale into money taken for nothing.
    const lost = await reconcileLostWebhooks(admin);
    // Deliberately not logged on `skipped`: sessions belonging to Stripe's
    // other mode are expected noise, not news.
    if (lost.recovered > 0 || lost.stranded > 0 || lost.failed > 0) {
      console.log("[ticketSweep] lost webhooks:", lost);
    }
    const expired = await expireStaleTicketHolds(admin);
    if (expired > 0) console.log(`[ticketSweep] expired ${expired} stale hold(s)`);
    const tickets = await sweepUndeliveredTickets(admin);
    if (tickets.pending > 0) console.log("[ticketSweep] undelivered:", tickets);
    const seats = await reconcileTicketAttendance(admin);
    if (seats.pending > 0) console.log("[ticketSweep] unseated:", seats);
  } catch (err) {
    console.error("ticket-sweep:", err);
    failed = true;
  }

  return { statusCode: failed ? 500 : 200 };
});
