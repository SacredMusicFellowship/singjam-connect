import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { resolveTicketPaymentState, type PaymentSession } from "@/lib/ticketPaymentState";
import TicketPaymentPanel from "@/components/TicketPaymentPanel";

// Card entry, on its own page.
//
// It used to swap in place inside the event page's ticket column, which put the
// Payment Element in a 384px strip with the set list, the attendee list and the
// map still around it — and gave the step no URL, so a refresh lost the form and
// the buyer's next Buy click minted a second order holding a second lot of
// stock. This page mints nothing: it reads the order it was handed and retrieves
// that order's existing session, so reloading is free.
//
// Fulfilment stays with the webhook and the receipt stays on ../complete, which
// is where Stripe's return_url already points. Nothing here writes.

export const metadata = { title: "Payment" };

export default async function TicketPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ order_id?: string }>;
}) {
  const { id: jamId } = await params;
  const { order_id } = await searchParams;

  const backToEvent = `/jam/${jamId}`;
  if (!order_id) redirect(backToEvent);

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = supabaseAdmin();
  // Only for the summary: the event name lets the per-tier line names shed the
  // "<event> — " prefix Stripe carries, and orients a page that otherwise shows
  // nothing about what is being bought.
  const { data: jam } = await admin.from("jams").select("name").eq("id", jamId).maybeSingle();
  const { data: order } = await admin
    .from("ticket_orders")
    .select("id, jam_id, status, amount_cents, currency, buyer_user_id, stripe_checkout_session_id, expires_at")
    .eq("id", order_id)
    .eq("jam_id", jamId)
    .maybeSingle();

  // Same rule as the receipt page: a member's order is shown only to that
  // member, and a guest order has no account behind it, so possession of the
  // unguessable order id is the only credential there is. Sending an
  // unauthorized caller back to the event page rather than to a 403 avoids
  // confirming that the order exists.
  const isGuestOrder = order != null && order.buyer_user_id === null;
  const mine = order && (isGuestOrder || (user && order.buyer_user_id === user.id)) ? order : null;
  if (!mine) redirect(backToEvent);

  // Read-only: this is the whole reason a reload is safe.
  let session: PaymentSession = null;
  if (mine.stripe_checkout_session_id) {
    try {
      // line_items has to be expanded; total_details comes back by default.
      const s = await stripe().checkout.sessions.retrieve(mine.stripe_checkout_session_id, {
        expand: ["line_items"],
      });
      session = {
        status: s.status,
        client_secret: s.client_secret,
        amount_total: s.amount_total,
        line_items: s.line_items?.data ?? null,
        discount_cents: s.total_details?.amount_discount ?? 0,
      };
    } catch {
      // A key in the wrong mode, a deleted session, Stripe being down. Falls
      // through to "expired", which offers to start again — never a card form.
      session = null;
    }
  }

  const state = resolveTicketPaymentState(mine as any, session, new Date(), jam?.name ?? null);

  if (state.kind === "done") {
    redirect(`/jam/${jamId}/tickets/complete?order_id=${mine.id}`);
  }

  if (state.kind === "expired") {
    return (
      <div className="mx-auto max-w-sm space-y-3">
        <h1 className="text-xl font-semibold text-zinc-900">This hold expired</h1>
        <p className="text-sm text-zinc-600">
          Tickets are only held for a short while, so yours went back on sale. Nothing was
          charged — pick them again and you&apos;ll be straight back here.
        </p>
        <Link
          href={backToEvent}
          className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
        >
          Back to tickets
        </Link>
      </div>
    );
  }

  return (
    <TicketPaymentPanel
      clientSecret={state.clientSecret}
      amountCents={state.amountCents}
      currency={state.currency}
      lines={state.lines}
      discountCents={state.discountCents}
      eventName={jam?.name ?? null}
    />
  );
}
