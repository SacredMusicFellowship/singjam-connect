"use client";

import { useEffect, useMemo, useState } from "react";
import { ticketTierAvailability as availability } from "@singjam/core";
import { coverageFeeCents } from "@/lib/ticketFees";

export type TicketType = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  quantity: number | null;
  remaining: number | null;
  sales_start_at: string | null;
  sales_end_at: string | null;
  on_sale: boolean;
  not_yet_open: boolean;
  closed: boolean;
};

const money = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

// Every tier row and the button live in one narrow column rather than the
// page's full 896px: a full-width Buy button reads as a banner, not a button.
// Full width on a phone, capped at 384px from sm, and from md the event page's
// right-hand column is already that narrow, so it fills it.
const COLUMN = "w-full sm:max-w-sm md:max-w-none";


// Buyers can't take the whole allocation in one order by accident, and it keeps
// the stepper bounded when a tier is uncapped.
const MAX_PER_TIER = 10;

function Stepper({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Remove one ${label}`}
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={value === 0}
        className="h-8 w-8 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
      >
        −
      </button>
      <span className="w-6 text-center text-sm tabular-nums">{value}</span>
      <button
        type="button"
        aria-label={`Add one ${label}`}
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="h-8 w-8 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
      >
        +
      </button>
    </div>
  );
}

export function TicketPurchaseSkeleton() {
  return (
    <div className={`space-y-3 ${COLUMN}`} aria-busy="true">
      <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center justify-between rounded-xl border border-zinc-200 p-3">
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-zinc-200" />
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-200" />
        </div>
      ))}
      <div className="h-11 w-full animate-pulse rounded-xl bg-zinc-200" />
    </div>
  );
}

export default function TicketPurchasePanel({
  jamId,
  isSignedIn,
  timezone,
}: {
  jamId: string;
  isSignedIn: boolean;
  /** The event's timezone, for dating a tier that hasn't opened yet. */
  timezone?: string | null;
}) {
  const [types, setTypes] = useState<TicketType[] | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestName, setGuestName] = useState("");
  const [promoCode, setPromoCode] = useState("");
  // Both start ticked, per the product call: covering fees is the norm, and a
  // buyer who does not want either can untick in one tap.
  const [coverFees, setCoverFees] = useState(true);
  const [marketingOptIn, setMarketingOptIn] = useState(true);
  const [showPromo, setShowPromo] = useState(false);
  const [promoBusy, setPromoBusy] = useState(false);
  // The applied discount, as previewed by the server. Cleared whenever the
  // selection changes, because the preview is computed against those items.
  const [applied, setApplied] = useState<{
    code: string;
    label: string;
    discount_cents: number;
    total_cents: number;
  } | null>(null);
  const [promoReason, setPromoReason] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/jam/${jamId}/tickets/types`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled) setTypes(j.ticket_types ?? []);
      })
      .catch(() => {
        if (!cancelled) setTypes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [jamId]);

  const { total, currency, count } = useMemo(() => {
    let total = 0;
    let count = 0;
    let currency = "usd";
    for (const t of types ?? []) {
      const n = qty[t.id] ?? 0;
      if (n > 0) {
        total += t.price_cents * n;
        count += n;
        currency = t.currency;
      }
    }
    return { total, currency, count };
  }, [types, qty]);

  async function startCheckout() {
    setError(null);
    setBusy(true);
    const items = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }));

    const res = await fetch(`/api/jam/${jamId}/tickets/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        items,
        ...(isSignedIn ? {} : { email: guestEmail.trim(), name: guestName.trim() }),
        // Only an applied (server-validated) code is sent, so checkout can't
        // fail on a code the buyer never successfully applied.
        ...(applied ? { promo_code: applied.code } : {}),
        cover_fees: coverFees,
        // Members are never asked — creating an account already subscribed them.
        ...(isSignedIn ? {} : { marketing_opt_in: marketingOptIn }),
      }),
    });
    const json = await res.json();
    setBusy(false);

    if (!res.ok) {
      // The reservation RPC returns readable reasons ("only 1 left of General").
      setError(json.error ?? "Could not start checkout");
      // Stock moved under us, so refresh what's actually left.
      fetch(`/api/jam/${jamId}/tickets/types`)
        .then((r) => r.json())
        .then((j) => setTypes(j.ticket_types ?? []));
      return;
    }
    // Local dev only: a preview of the next step, with no order behind it.
    if (json.preview_url) {
      window.location.href = json.preview_url;
      return;
    }
    // A fully-discounted order is already fulfilled server-side — there is no
    // payment step to show, so go straight to the confirmation.
    if (json.free) {
      window.location.href = `/jam/${jamId}/tickets/complete?order_id=${json.order_id}`;
      return;
    }
    // Card entry has its own page. Only the order id travels — the secret is
    // retrieved there, server-side, which is what makes that page reloadable
    // and keeps the secret out of the URL and out of history.
    window.location.href = `/jam/${jamId}/tickets/pay?order_id=${json.order_id}`;
  }

  async function applyPromo() {
    const code = promoCode.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoReason(null);
    const items = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([ticket_type_id, quantity]) => ({ ticket_type_id, quantity }));

    const res = await fetch(`/api/jam/${jamId}/tickets/promo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, items }),
    });
    const json = await res.json();
    setPromoBusy(false);

    if (!res.ok) {
      setPromoReason(json.error ?? "Could not check that code");
      return;
    }
    if (!json.valid) {
      setApplied(null);
      setPromoReason(json.reason ?? "That code isn't valid");
      return;
    }
    setApplied({
      code: json.code,
      label: json.label,
      discount_cents: json.discount_cents,
      total_cents: json.total_cents,
    });
  }

  // Mirrors the server's check so the button state matches what the API accepts.
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());

  const subtotal = applied ? applied.total_cents : total;
  const feeCents = coverFees ? coverageFeeCents(subtotal) : 0;
  const payable = subtotal + feeCents;

  if (types === null) return <TicketPurchaseSkeleton />;
  if (types.length === 0) return null;

  // Nothing buyable right now. Kept apart from "sold out" because a tier that
  // is merely outside its sales window still has stock, and telling a buyer an
  // event sold out when it hasn't costs a sale.
  const nothingOnSale = types.every((t) => !t.on_sale);
  const soldOut = nothingOnSale && types.every((t) => t.remaining === 0);

  return (
    <div className={`space-y-3 ${COLUMN}`}>
      <h3 className="text-sm font-semibold tracking-wide text-zinc-700">Tickets</h3>

      {types.map((t) => {
        const max = Math.min(MAX_PER_TIER, t.remaining ?? MAX_PER_TIER);
        const note = availability(t, timezone);
        return (
          <div
            key={t.id}
            // Dimmed when it can't be bought, so the tiers that can be read as
            // the live ones at a glance.
            className={`flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2 sm:py-3 ${
              t.on_sale ? "" : "opacity-60"
            }`}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-zinc-900">{t.name}</p>
              {t.description && <p className="truncate text-xs text-zinc-500">{t.description}</p>}
              <p className="text-xs text-zinc-500">
                {money(t.price_cents, t.currency)}
                {note ? ` · ${note}` : ""}
              </p>
            </div>

            {t.on_sale ? (
              <Stepper
                label={t.name}
                value={qty[t.id] ?? 0}
                max={max}
                onChange={(n) => {
                  setQty((q) => ({ ...q, [t.id]: n }));
                  // The previewed total was for the old selection.
                  setApplied(null);
                  setPromoReason(null);
                }}
              />
            ) : (
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-500">
                {t.not_yet_open ? "Soon" : "Unavailable"}
              </span>
            )}
          </div>
        );
      })}

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {/* No account required. Someone arriving from a shared link should be able
          to buy without signing up; the email is where their ticket goes. */}
      {!isSignedIn && count > 0 && (
        <div className="space-y-2 rounded-xl border border-zinc-200 p-3">
          <label className="block text-xs font-medium text-zinc-600" htmlFor="guest-name">
            Name
          </label>
          <input
            id="guest-name"
            type="text"
            autoComplete="name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            placeholder="Your name"
          />
          <label className="block text-xs font-medium text-zinc-600" htmlFor="guest-email">
            Email
          </label>
          <input
            id="guest-email"
            type="email"
            autoComplete="email"
            required
            value={guestEmail}
            onChange={(e) => setGuestEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            placeholder="you@example.com"
          />
          <p className="text-xs text-zinc-400">
            We&apos;ll send your ticket here.{" "}
            <a href={`/auth?next=${encodeURIComponent(`/jam/${jamId}`)}`} className="underline hover:text-zinc-600">
              Or sign in
            </a>
            .
          </p>

          {/* Asked here rather than by the Buy button because it is a question
              about the address just typed, not about the payment. Guests only —
              a member subscribed when they created their account. */}
          <label className="flex cursor-pointer items-start gap-2.5 border-t border-zinc-100 pt-2.5 text-sm text-zinc-600">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
            />
            <span>Email me about future SingJam events</span>
          </label>
        </div>
      )}

      {/* Sits directly above the Buy button, where the total is and where people
          look for a discount. Applying is a separate step from paying so the
          buyer sees success or failure and their real total before committing —
          and an invalid code costs nothing, since the preview reserves no stock. */}
      {count > 0 && (
        applied ? (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
            <p className="text-xs text-green-800">
              <span className="font-mono font-medium tracking-wider">{applied.code}</span> applied ·{" "}
              {applied.label} · −{money(applied.discount_cents, currency)}
            </p>
            <button
              type="button"
              onClick={() => {
                setApplied(null);
                setPromoCode("");
                setPromoReason(null);
              }}
              className="shrink-0 text-xs text-green-700 underline hover:text-green-900"
            >
              Remove
            </button>
          </div>
        ) : showPromo ? (
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                autoFocus
                value={promoCode}
                onChange={(e) => {
                  setPromoCode(e.target.value);
                  setPromoReason(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyPromo();
                  }
                }}
                placeholder="Promo code"
                autoCapitalize="characters"
                className="min-w-0 flex-1 rounded-lg border border-zinc-200 px-3 py-2 text-sm uppercase tracking-wider focus:border-amber-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={applyPromo}
                disabled={promoBusy || !promoCode.trim()}
                className="shrink-0 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
              >
                {promoBusy ? "Checking…" : "Apply"}
              </button>
            </div>
            {promoReason && (
              <p role="alert" className="text-xs text-red-600">
                {promoReason}
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPromo(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-medium text-amber-600 hover:border-amber-300 hover:bg-amber-50 transition-colors"
          >
            <span aria-hidden="true">＋</span> Promo Code
          </button>
        )
      )}

      {/* Last thing before paying, and deliberately after the promo block: the
          amount depends on the discounted total, so it has to be read where the
          buyer can already see what they are actually paying. */}
      {count > 0 && !nothingOnSale && (
        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-zinc-600">
          <input
            type="checkbox"
            checked={coverFees}
            onChange={(e) => setCoverFees(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500"
          />
          <span>
            Cover the {money(coverageFeeCents(subtotal), currency)} processing fee so all of my
            ticket goes to SingJam
          </span>
        </label>
      )}

      <button
        onClick={startCheckout}
        disabled={busy || count === 0 || nothingOnSale || (!isSignedIn && !emailLooksValid)}
        className="w-full rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
      >
        {soldOut
          ? "Sold out"
          : nothingOnSale
          ? "Sales closed"
          : busy
          ? "Starting checkout…"
          : count === 0
          ? "Select tickets"
          : !isSignedIn && !emailLooksValid
          ? "Enter your email"
          : `Buy ${count} ticket${count === 1 ? "" : "s"} · ${money(payable, currency)}`}
      </button>
    </div>
  );
}
