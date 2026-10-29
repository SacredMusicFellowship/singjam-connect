import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { resolveTicketOutcome, type OutcomeSession } from "@/lib/ticketOutcome";
import TicketConfirmationPoller from "@/components/TicketConfirmationPoller";
import { findEventSet } from "@/lib/eventSet";
import { inNextDev } from "@/lib/devSafety";
import { buildCheckoutPreview, parsePreviewItems } from "@/lib/ticketCheckoutPreview";
import { redirect } from "next/navigation";

// `next dev` only: each state of this page, by link, without a real order.
const SHOW_STATES = ["paid", "pending", "failed", "refunded", "missing"] as const;
type ShowState = (typeof SHOW_STATES)[number];
const SHOW_LABELS: Record<ShowState, string> = {
  paid: "paid",
  pending: "confirming",
  failed: "didn't complete",
  refunded: "refunded",
  missing: "not found",
};

// Where Stripe returns the buyer after payment. This page only *reports* status —
// it never fulfils. Fulfilment is the webhook's job, because the buyer can close
// the tab before this renders and a client-side callback can't be trusted.
//
// That means the order may still read 'pending' here for a second or two while
// the webhook lands, so the pending state is framed as "confirming", not failure.

export default async function TicketsCompletePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    session_id?: string;
    order_id?: string;
    preview?: string;
    promo?: string;
    cover?: string;
    show?: string;
    set?: string;
  }>;
}) {
  const { id: jamId } = await params;
  const { session_id, order_id, preview, promo, cover, show, set } = await searchParams;
  const dev = inNextDev();
  const showState = dev && (SHOW_STATES as readonly string[]).includes(show ?? "") ? (show as ShowState) : null;

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = supabaseAdmin();
  const { data: jam } = await admin.from("jams").select("name").eq("id", jamId).maybeSingle();

  // The set is the reason to come back before the day, so link it directly
  // rather than making people find it on the event page. Readable by anyone,
  // so guests get the link too — adding to it is what needs an account. Shown
  // whenever the event has a set, even before songs are added.
  const realSet = await findEventSet(admin, jamId);
  // In dev, set=none / set=some shows the page without or with the set-list
  // button whatever this event's set holds; "some" links to the event page
  // when there's no real set to link to.
  const linkedSet = !dev || !set ? realSet : set === "none" ? null : realSet ?? { id: "" };

  // A charged order is found by its Stripe session; a comped one never had a
  // session, so it comes back by order id instead. Both identifiers are v4
  // uuids or Stripe's own opaque ids — unguessable, which is what the guest
  // access rule below leans on.
  // `next dev` only: the end of the previewed flow, standing in a paid order
  // built from the selection. Nothing was reserved, charged or emailed.
  const previewItems = preview && dev ? parsePreviewItems(preview) : null;
  const summary = previewItems
    ? await buildCheckoutPreview(admin, jamId, jam?.name ?? null, previewItems, promo ?? "", cover === "1")
    : null;
  if (summary && "error" in summary) redirect(`/jam/${jamId}`);
  const previewOrder =
    summary && !("error" in summary)
      ? {
          id: "preview",
          status: "paid",
          amount_cents: summary.amountCents,
          currency: summary.currency,
          buyer_user_id: user?.id ?? null,
          buyer_email: null,
          stripe_checkout_session_id: null,
        }
      : showState && showState !== "missing"
      ? {
          id: "preview",
          status: showState,
          amount_cents: 1500,
          currency: "usd",
          buyer_user_id: user?.id ?? null,
          buyer_email: null,
          stripe_checkout_session_id: null,
        }
      : null;

  const columns =
    "id, status, amount_cents, currency, buyer_user_id, buyer_email, stripe_checkout_session_id";
  const { data: order } = previewOrder
    ? { data: previewOrder }
    : showState
    ? { data: null }
    : session_id
    ? await admin.from("ticket_orders").select(columns).eq("stripe_checkout_session_id", session_id).maybeSingle()
    : order_id
    ? await admin.from("ticket_orders").select(columns).eq("id", order_id).maybeSingle()
    : { data: null };

  // A member's order is shown only to that member — a session id in the URL must
  // not expose someone else's purchase. A guest order has no account behind it,
  // so possession of the unguessable session id is the only credential there is;
  // this is the same model Stripe's own return-page samples use.
  const isGuestOrder = order != null && order.buyer_user_id === null;
  const mine = order && (isGuestOrder || (user && order.buyer_user_id === user.id)) ? order : null;

  // Nobody needs to wait for our webhook to find out whether their card went
  // through — Stripe already knows by the time it sends the buyer here. Only
  // asked when our own status is still behind, so the happy path costs nothing.
  let session: OutcomeSession = null;
  if (mine?.status === "pending" && mine.stripe_checkout_session_id) {
    try {
      const s = await stripe().checkout.sessions.retrieve(mine.stripe_checkout_session_id);
      session = { payment_status: s.payment_status };
    } catch {
      // Leave it null: a failed lookup must never read as a successful payment.
      session = null;
    }
  }
  const outcome = resolveTicketOutcome(mine, session);

  const ticketCount = previewItems
    ? previewItems.reduce((n, i) => n + i.quantity, 0)
    : showState
    ? 1
    : mine
    ? (await admin.from("tickets").select("id", { count: "exact", head: true }).eq("order_id", mine.id)).count ?? 0
    : 0;

  const money = (cents: number, currency: string) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

  const jamName = jam?.name ?? "the jam";

  return (
    <div className="mx-auto max-w-md space-y-4 py-8">
      {(previewOrder || showState) && (
        <p className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900">
          Preview — no ticket was reserved, nothing was charged or emailed.
        </p>
      )}
      {outcome.kind === "paid" && mine ? (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">
            You&apos;re in! 🎉 We can&apos;t wait to sing with you.
          </h1>
          <p className="text-sm text-zinc-600">
            See you at {jamName}. {ticketCount} ticket{ticketCount === 1 ? "" : "s"} ·{" "}
            {money(mine.amount_cents, mine.currency)} — check your email for your ticket confirmation.
          </p>
        </>
      ) : outcome.kind === "pending" ? (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">Confirming your payment…</h1>
          <TicketConfirmationPoller />
        </>
      ) : outcome.kind === "refunded" ? (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">This order was refunded</h1>
          <p className="text-sm text-zinc-600">Nothing further is owed.</p>
        </>
      ) : outcome.kind === "failed" ? (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">Payment didn&apos;t complete</h1>
          <p className="text-sm text-zinc-600">
            Your card wasn&apos;t charged and the tickets have been released. You can try again from
            the event page.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-xl font-semibold text-zinc-900">Order not found</h1>
          <p className="text-sm text-zinc-600">
            We couldn&apos;t find that order. If you were charged, contact us and we&apos;ll sort it out.
          </p>
        </>
      )}

      {outcome.awaitingFulfilment && <TicketConfirmationPoller quiet />}

      {/* A guest has paid but has no account, so jam_rsvps has nowhere to point:
          they're coming and nobody can see it. Signing up with the same address
          claims the order (claimGuestTickets) and turns it into attendance. */}
      {outcome.kind === "paid" && mine && isGuestOrder && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
          <h2 className="text-sm font-semibold text-zinc-900">Help choose songs for this SingJam 🎶</h2>
          <p className="text-sm text-zinc-600">
            You&apos;re on the guest list. Create an account to add songs to our set list and
            checkout faster next time.
          </p>
          <Link
            href={`/auth?next=/jam/${jamId}`}
            className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
          >
            Create an account
          </Link>
          {mine.buyer_email && (
            <p className="text-xs text-zinc-500">
              Sign up with {mine.buyer_email} and this ticket comes with you.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {outcome.kind === "paid" && linkedSet && (
          <Link
            href={linkedSet.id ? `/set/${linkedSet.id}` : `/jam/${jamId}`}
            className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
          >
            View set list
          </Link>
        )}
        <Link
          href={`/jam/${jamId}`}
          className={
            outcome.kind === "paid" && linkedSet
              ? "inline-block rounded-xl border border-zinc-200 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
              : "inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
          }
        >
          Back to {jamName}
        </Link>
      </div>

      {dev && (
        <div className="space-y-1 pt-4 text-xs text-amber-700">
          <p>
            Local dev, preview this page:{" "}
            {SHOW_STATES.map((s, i) => (
              <span key={s}>
                {i > 0 && " · "}
                <Link href={`/jam/${jamId}/tickets/complete?show=${s}${set ? `&set=${set}` : ""}`} className="underline">
                  {SHOW_LABELS[s]}
                </Link>
              </span>
            ))}
          </p>
          <p>
            Set-list button:{" "}
            <Link href={`/jam/${jamId}/tickets/complete?show=${showState ?? "paid"}&set=some`} className="underline">
              with a set
            </Link>
            {" · "}
            <Link href={`/jam/${jamId}/tickets/complete?show=${showState ?? "paid"}&set=none`} className="underline">
              no set
            </Link>
            {" · "}
            <Link href={`/jam/${jamId}/tickets/complete?show=${showState ?? "paid"}`} className="underline">
              this event&apos;s real set
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
