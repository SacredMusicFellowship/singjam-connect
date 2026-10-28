import type { SupabaseClient } from "@supabase/supabase-js";
import { markAttending } from "@/lib/jamAttendance";
import { SITE_URL } from "@/lib/stripe";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { ticketConfirmationHtml } from "@/emails/ticket-confirmation";
import { syncContact } from "@/lib/activecampaign";
import { findSetWithSongs } from "@/lib/setWithSongs";

// Turning a pending order into a real ticket: mark it paid, send the ticket,
// seat the buyer. Two callers reach this — the Stripe webhook for anything that
// was actually charged, and the checkout route directly when a promotion code
// takes the total to zero and there is no payment to wait for. One copy, so a
// comped ticket and a bought one are the same kind of thing afterwards.

export type PaidOrder = {
  id: string;
  jam_id: string;
  buyer_user_id: string | null;
  buyer_email: string | null;
  buyer_name: string | null;
  amount_cents: number;
  currency: string;
};

// Resolves the recipient and ticket list, then sends. Members may have no
// buyer_email stored, so fall back to their auth record. Returns false when
// there is no address to send to — the caller must not then stamp the order as
// delivered, or the sweeper would never look at it again.
export async function sendTicketEmail(admin: SupabaseClient, order: PaidOrder): Promise<boolean> {
  let email = order.buyer_email;
  let name = order.buyer_name;

  if (!email && order.buyer_user_id) {
    const [{ data: authData }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(order.buyer_user_id),
      admin.from("profiles").select("display_name, username").eq("id", order.buyer_user_id).maybeSingle(),
    ]);
    email = authData.user?.email ?? null;
    name = name ?? (profile as any)?.display_name ?? (profile as any)?.username ?? null;
  }
  if (!email) return false;

  const [{ data: jam }, { data: tickets }] = await Promise.all([
    admin
      .from("jams")
      .select("name, starts_at, ends_at, timezone, full_address, neighborhood")
      .eq("id", order.jam_id)
      .maybeSingle(),
    admin.from("tickets").select("qr_token, ticket_types(name, price_cents)").eq("order_id", order.id),
  ]);

  // The set is the reason to come back before the day, so the email leads with
  // it once it has songs — same rule and order as the confirmation page.
  const linkedSet = await findSetWithSongs(admin, order.jam_id);

  const jamName = jam?.name ?? "the jam";

  const { error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: `Your ticket${(tickets ?? []).length === 1 ? "" : "s"} for ${jamName}`,
    html: ticketConfirmationHtml({
      name,
      jamName,
      jamId: order.jam_id,
      jamUrl: `${SITE_URL}/jam/${order.jam_id}`,
      startsAt: jam?.starts_at,
      endsAt: (jam as any)?.ends_at ?? null,
      timezone: (jam as any)?.timezone,
      address: jam?.full_address ?? jam?.neighborhood ?? null,
      tickets: (tickets ?? []).map((t: any) => ({
        tierName: t.ticket_types?.name ?? "Ticket",
        qrToken: t.qr_token,
        priceCents: t.ticket_types?.price_cents ?? null,
      })),
      amountCents: order.amount_cents,
      currency: order.currency,
      isGuest: !order.buyer_user_id,
      signUpUrl: `${SITE_URL}/auth?next=/jam/${order.jam_id}`,
      setUrl: linkedSet ? `${SITE_URL}/set/${linkedSet.id}` : null,
    }),
  });
  // Thrown, not `return false`: false means "no address", which the sweeper
  // gives up on, while a failed send must stay in the retry queue.
  if (error) throw new Error(error.message ?? "Resend send error");

  return true;
}

// Everything that follows a pending order becoming real. Idempotent throughout:
// the status guard means only one caller can transition an order, the email is
// guarded on its own timestamp, and markAttending is a no-op when repeated.
//
// `amountCents` is what was actually collected — Stripe's amount_total for a
// charged order, 0 for a comped one. Our stored amount_cents was computed from
// tier prices before any discount, so leaving it would overstate revenue.
export async function fulfilPendingOrder(
  admin: SupabaseClient,
  orderId: string,
  opts: { amountCents?: number | null; paymentIntentId?: string | null } = {},
): Promise<PaidOrder | null> {
  const now = new Date().toISOString();

  const { data: updated } = await admin
    .from("ticket_orders")
    .update({
      status: "paid",
      paid_at: now,
      updated_at: now,
      stripe_payment_intent_id: opts.paymentIntentId ?? null,
      ...(typeof opts.amountCents === "number" ? { amount_cents: opts.amountCents } : {}),
    })
    .eq("id", orderId)
    .eq("status", "pending")
    .select(
      "id, jam_id, buyer_user_id, buyer_email, buyer_name, amount_cents, currency, ticket_email_sent_at, marketing_opt_in"
    )
    .maybeSingle();

  // Already fulfilled, expired, or gone — a redelivery, so nothing to do.
  if (!updated) return null;

  // Send the ticket before anything else — for a guest this email is their only
  // copy. Isolated so a mail failure never fails the caller; the order is
  // already correctly paid and the unstamped row is a retry queue.
  if (!(updated as any).ticket_email_sent_at) {
    try {
      if (await sendTicketEmail(admin, updated as PaidOrder)) {
        await admin.from("ticket_orders").update({ ticket_email_sent_at: now }).eq("id", updated.id);
      }
    } catch (e) {
      console.error("ticket confirmation email failed", updated.id, e);
    }
  }

  // Only on a real sale, and only for a guest who asked. Members reach the
  // mailing list by creating an account, and an order that was never paid for
  // should not put anyone on a list. Isolated like the email: an ActiveCampaign
  // outage must not fail a webhook for an order that is correctly paid.
  if ((updated as any).marketing_opt_in && !updated.buyer_user_id && updated.buyer_email) {
    try {
      // Checkout collects one "Name" field, so split it rather than putting
      // "Ada Lovelace" in a field labelled First name.
      const [firstName, ...rest] = (updated.buyer_name ?? "").trim().split(/\s+/);
      await syncContact(updated.buyer_email, {
        ...(firstName ? { firstName } : {}),
        ...(rest.length ? { lastName: rest.join(" ") } : {}),
      }, { tag: false });
    } catch (e) {
      console.error("mailing list sync failed", updated.id, e);
    }
  }

  // Guests have no profile to attach attendance to — jam_rsvps.user_id is NOT
  // NULL. Their order and tickets are the record, and they show on the guest
  // list through the guest-attendees route instead.
  //
  // Isolated for the same reason as the email: the order is already correctly
  // paid, and throwing here gave Stripe a 500 on a completed sale. Its retry
  // could never help either — the status guard above means a redelivery
  // returns early, so the retry succeeded having done nothing. Safe to swallow
  // only because reconcileTicketAttendance re-derives the missing seat from
  // migration 161 and repairs it within ten minutes.
  if (updated.buyer_user_id) {
    try {
      await markAttending(admin, updated.jam_id, updated.buyer_user_id);
    } catch (e) {
      console.error("seating the buyer failed", updated.id, e);
    }
  }

  return updated as PaidOrder;
}
