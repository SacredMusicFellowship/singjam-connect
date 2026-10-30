"use client";

import { useCallback, useEffect, useState } from "react";
import { isoToZonedInput, zonedInputToIso, zoneAbbreviation } from "@singjam/core";
import { guestListToCsv, guestListFilename } from "@/lib/guestListCsv";
import { promoUses } from "@/lib/promoUses";

type Tier = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  currency: string;
  quantity: number | null;
  sales_start_at: string | null;
  sales_end_at: string | null;
  sold: number;
  held: number;
  remaining: number | null;
  on_sale: boolean;
};

/** What a tier form holds while it is being edited. */
type TierDraft = {
  name: string;
  price: string;
  quantity: string;
  /** `datetime-local` values, read as wall clocks in the event's timezone. */
  salesStart: string;
  salesEnd: string;
};

const EMPTY_DRAFT: TierDraft = { name: "", price: "", quantity: "", salesStart: "", salesEnd: "" };

function draftFromTier(t: Tier, zone: string): TierDraft {
  return {
    name: t.name,
    price: (t.price_cents / 100).toFixed(2),
    quantity: t.quantity === null ? "" : String(t.quantity),
    salesStart: isoToZonedInput(t.sales_start_at, zone),
    salesEnd: isoToZonedInput(t.sales_end_at, zone),
  };
}

/** The event-wide cap across every tier (jams.ticket_limit). */
type TicketLimit = { quantity: number; sold: number; held: number; remaining: number };

type Guest = {
  ticket_id: string;
  code: string;
  name: string;
  email: string | null;
  tier: string;
  is_member: boolean;
  is_leader?: boolean;
  checked_in_at: string | null;
  // Returned by the orders route all along; the type just never said so.
  paid_at: string | null;
  order_amount_cents: number;
  order_tickets: number;
  order_position: number;
  currency: string;
};

// What the buyer paid for the order this ticket is part of — on the order's
// first ticket only, so a two-ticket order doesn't read as two purchases.
function paidLabel(g: Guest) {
  if (g.order_position > 1 || g.is_leader) return "";
  const amount = money(g.order_amount_cents, g.currency);
  return g.order_tickets > 1 ? `${amount} for ${g.order_tickets} tickets` : amount;
}

// "ticket 2 of 2" beside a name that would otherwise appear twice.
function OrderPosition({ guest }: { guest: Guest }) {
  if (guest.order_tickets < 2) return null;
  return (
    <span className="shrink-0 text-xs text-zinc-400">
      ticket {guest.order_position} of {guest.order_tickets}
    </span>
  );
}

type PromoCode = { id: string; code: string; label: string; redeemed: number | null };

type Summary = {
  tickets_sold: number;
  leaders?: number;
  orders: number;
  gross_cents: number;
  fee_cents: number;
  net_cents: number;
  fees_pending: number;
  currency: string;
  checked_in: number;
};

// Door staff read this off a phone, one-handed, in a room with the band already
// playing. Both states are the same size so the row does not jump under the
// thumb when a tap lands, and 44px is the smallest target worth aiming at.
function CheckInButton({
  guest,
  onToggle,
}: {
  guest: Guest;
  onToggle: (g: Guest) => void;
}) {
  const inHouse = !!guest.checked_in_at;
  return (
    <button
      onClick={() => onToggle(guest)}
      aria-pressed={inHouse}
      title={inHouse ? "Tap to undo" : "Check in"}
      className={`min-h-[44px] w-[5.5rem] shrink-0 rounded-lg px-3 text-xs font-medium transition-colors sm:min-h-0 sm:w-auto sm:py-1.5 ${
        inHouse
          ? "bg-green-100 text-green-700 hover:bg-green-200"
          : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
      }`}
    >
      {inHouse ? "\u2713 In" : "Check in"}
    </button>
  );
}

// Local time on purpose: whoever reads this is standing at the door.
const doorTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

const money = (cents: number, currency = "usd") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);

// Prices are entered in dollars but stored in cents. Rounding here rather than
// truncating means 19.99 doesn't silently become 19.98 through float error.
const toCents = (dollars: string) => Math.round(parseFloat(dollars || "0") * 100);

const INPUT_CLASS =
  "rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none";

// A sales window as the host set it, in the event's own timezone.
function windowLabel(t: Tier, zone: string): string | null {
  const at = (iso: string) =>
    new Date(iso).toLocaleString("en-US", {
      timeZone: zone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  if (t.sales_start_at && t.sales_end_at) return `On sale ${at(t.sales_start_at)} – ${at(t.sales_end_at)}`;
  if (t.sales_start_at) return `On sale from ${at(t.sales_start_at)}`;
  if (t.sales_end_at) return `On sale until ${at(t.sales_end_at)}`;
  return null;
}

/**
 * Name, price, cap and sales window for one tier. Shared by the add form and
 * the per-tier edit form so both write a window the same way.
 *
 * Times are wall clocks in the event's timezone, which is the only reading a
 * host means: "advance sales end Oct 3 at 11:59pm" is 11:59pm at the venue,
 * whether the host is typing it from Berkeley or from a tour bus in Ohio.
 */
function TierFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: TierDraft;
  onChange: (patch: Partial<TierDraft>) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          aria-label="Tier name"
          value={draft.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="General"
          required
          className={INPUT_CLASS}
        />
        <input
          aria-label="Price in dollars"
          value={draft.price}
          onChange={(e) => onChange({ price: e.target.value })}
          placeholder="15.00"
          inputMode="decimal"
          required
          className={INPUT_CLASS}
        />
        <input
          aria-label="Quantity, blank for unlimited"
          value={draft.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          placeholder="Qty (blank = ∞)"
          inputMode="numeric"
          className={INPUT_CLASS}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-start`} className="block text-xs font-medium text-zinc-600">
            On sale from
          </label>
          <input
            id={`${idPrefix}-start`}
            type="datetime-local"
            value={draft.salesStart}
            onChange={(e) => onChange({ salesStart: e.target.value })}
            className={`w-full ${INPUT_CLASS}`}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-end`} className="block text-xs font-medium text-zinc-600">
            On sale until
          </label>
          <input
            id={`${idPrefix}-end`}
            type="datetime-local"
            value={draft.salesEnd}
            onChange={(e) => onChange({ salesEnd: e.target.value })}
            className={`w-full ${INPUT_CLASS}`}
          />
        </div>
      </div>
    </div>
  );
}

// Counts on the first row, money on the second. Two up on a phone with net
// across the full width: at three, a gross of $1,234.00 ran straight into the
// next tile.
const STAT_GRID = "grid grid-cols-2 gap-3 sm:grid-cols-6";
const STAT_SPANS = ["sm:col-span-3", "sm:col-span-3", "sm:col-span-2", "sm:col-span-2", "col-span-2 sm:col-span-2"];

export function TicketManagerSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className={STAT_GRID}>
        {STAT_SPANS.map((span, i) => (
          <div key={i} className={`rounded-xl border border-zinc-200 p-3 ${span}`}>
            <div className="h-3 w-16 animate-pulse rounded bg-zinc-100" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-zinc-200" />
          </div>
        ))}
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100" />
      ))}
    </div>
  );
}

export default function TicketTierManager({
  jamId,
  jamName,
  timezone,
}: {
  jamId: string;
  jamName?: string | null;
  /** The event's timezone. Sales windows are entered and shown in it. */
  timezone?: string | null;
}) {
  // Every official event stores a timezone, so the fallback is a safety net
  // rather than a path — but a null one must not become UTC, which would move
  // an evening window onto the next day.
  const zone = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [ticketLimit, setTicketLimit] = useState<TicketLimit | null>(null);
  const [limitDraft, setLimitDraft] = useState("");
  const [guests, setGuests] = useState<Guest[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [promoKind, setPromoKind] = useState<"percent" | "amount">("percent");
  const [promoValue, setPromoValue] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);

  // Draft state for the add form, and for whichever tier is open for editing.
  const [draft, setDraft] = useState<TierDraft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TierDraft>(EMPTY_DRAFT);

  const load = useCallback(async () => {
    const [tRes, oRes, pRes] = await Promise.all([
      fetch(`/api/jam/${jamId}/tickets/types`).then((r) => r.json()),
      fetch(`/api/jam/${jamId}/tickets/orders`).then((r) => r.json()),
      fetch(`/api/jam/${jamId}/tickets/promos`).then((r) => r.json()),
    ]);
    setTiers(tRes.ticket_types ?? []);
    setTicketLimit(tRes.ticket_limit ?? null);
    setLimitDraft(tRes.ticket_limit ? String(tRes.ticket_limit.quantity) : "");
    setGuests(oRes.guests ?? []);
    setSummary(oRes.summary ?? null);
    setPromos(pRes.promo_codes ?? []);
  }, [jamId]);

  useEffect(() => {
    load();
  }, [load]);

  async function send(method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown, qs = "") {
    setError(null);
    setBusy(true);
    const res = await fetch(`/api/jam/${jamId}/tickets/types${qs}`, {
      method,
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Something went wrong");
      return false;
    }
    await load();
    return true;
  }

  // The window is entered as a wall clock and stored as an instant. An end time
  // takes the whole minute (…:59) so "until 11:59pm" doesn't leave a minute of
  // dead air before the next tier opens at midnight.
  function windowFields(d: TierDraft) {
    return {
      sales_start_at: zonedInputToIso(d.salesStart, zone),
      sales_end_at: zonedInputToIso(d.salesEnd, zone, 59),
    };
  }

  function tierFields(d: TierDraft) {
    return {
      name: d.name.trim(),
      price_cents: toCents(d.price),
      quantity: d.quantity.trim() === "" ? null : Number(d.quantity),
      ...windowFields(d),
    };
  }

  async function addTier(e: React.FormEvent) {
    e.preventDefault();
    const ok = await send("POST", { ...tierFields(draft), sort_order: tiers?.length ?? 0 });
    if (ok) setDraft(EMPTY_DRAFT);
  }

  function startEditing(t: Tier) {
    setError(null);
    setEditingId(t.id);
    setEditDraft(draftFromTier(t, zone));
  }

  async function saveTier(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const ok = await send("PATCH", { id: editingId, ...tierFields(editDraft) });
    if (ok) setEditingId(null);
  }

  async function saveLimit(e: React.FormEvent) {
    e.preventDefault();
    await send("PUT", { ticket_limit: limitDraft.trim() === "" ? null : Number(limitDraft) });
  }

  async function addPromo(e: React.FormEvent) {
    e.preventDefault();
    setPromoError(null);
    setBusy(true);
    const res = await fetch(`/api/jam/${jamId}/tickets/promos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        code: promoCode.trim(),
        ...(promoKind === "percent"
          ? { percent_off: Number(promoValue) }
          : { amount_off_cents: toCents(promoValue) }),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setPromoError((await res.json()).error ?? "Could not create that code");
      return;
    }
    setPromoCode("");
    setPromoValue("");
    await load();
  }

  async function removePromo(id: string) {
    setPromoError(null);
    setBusy(true);
    const res = await fetch(`/api/jam/${jamId}/tickets/promos?id=${id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setPromoError((await res.json()).error ?? "Could not remove that code");
      return;
    }
    await load();
  }

  async function toggleCheckIn(g: Guest) {
    setError(null);
    const checkingIn = !g.checked_in_at;

    // Optimistic: at a door the feedback needs to be instant, and the request is
    // idempotent either way.
    setGuests((prev) =>
      prev.map((x) =>
        x.ticket_id === g.ticket_id
          ? { ...x, checked_in_at: checkingIn ? new Date().toISOString() : null }
          : x
      )
    );
    setSummary((s) => (s ? { ...s, checked_in: s.checked_in + (checkingIn ? 1 : -1) } : s));

    const res = checkingIn
      ? await fetch(`/api/jam/${jamId}/tickets/checkin`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ticket_id: g.ticket_id }),
        })
      : await fetch(`/api/jam/${jamId}/tickets/checkin?ticket_id=${g.ticket_id}`, { method: "DELETE" });

    if (!res.ok) {
      setError((await res.json()).error ?? "Check-in failed");
      await load(); // roll back to whatever the server actually thinks
      return;
    }
    const json = await res.json();
    if (json.already_checked_in) {
      setGuests((prev) =>
        prev.map((x) => (x.ticket_id === g.ticket_id ? { ...x, checked_in_at: json.checked_in_at } : x))
      );
    }
  }

  function downloadCsv() {
    const blob = new Blob([guestListToCsv(guests)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = guestListFilename(jamName);
    a.click();
    URL.revokeObjectURL(url);
  }

  const filtered = guests.filter((g) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      (g.email ?? "").toLowerCase().includes(q) ||
      g.code.toLowerCase().includes(q)
    );
  });

  if (tiers === null) return <TicketManagerSkeleton />;

  return (
    <div className="space-y-6">
      {summary && (
        <div className="space-y-2">
          <div className={STAT_GRID}>
            {[
              { label: "Tickets sold", value: String(summary.tickets_sold) },
              { label: "Checked in", value: `${summary.checked_in}/${summary.tickets_sold + (summary.leaders ?? 0)}` },
              { label: "Gross", value: money(summary.gross_cents, summary.currency) },
              { label: "Stripe fees", value: money(summary.fee_cents, summary.currency) },
              { label: "Net", value: money(summary.net_cents, summary.currency) },
            ].map((stat, i) => (
              <div key={stat.label} className={`rounded-xl border border-zinc-200 p-3 ${STAT_SPANS[i]}`}>
                <p className="text-xs font-medium tracking-wide text-zinc-500">{stat.label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 sm:text-2xl">{stat.value}</p>
              </div>
            ))}
          </div>
          {summary.fees_pending > 0 ? (
            <p className="text-xs text-amber-700">
              Stripe hasn&apos;t settled the fee on {summary.fees_pending}{" "}
              {summary.fees_pending === 1 ? "order" : "orders"} yet, so net may be a little high. Reload
              later to update it.
            </p>
          ) : (
            summary.fee_cents > 0 && (
              <p className="text-xs text-zinc-400">
                Fees include any Stripe kept on refunded orders. Payouts are in the Stripe Dashboard.
              </p>
            )
          )}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-700">Ticket tiers</h2>

        {/* Said once for the section rather than inside each form, which put the
            same sentence on screen twice whenever a tier was open for editing. */}
        <p className="text-xs text-zinc-400">
          Sales times are {zone.replace(/_/g, " ")} ({zoneAbbreviation(zone)}) — the event&apos;s
          timezone, not yours. Leave one blank for no limit; an end time runs through the end of
          that minute.
        </p>

        <form onSubmit={saveLimit} className="space-y-2 rounded-xl border border-zinc-200 p-3">
          <label htmlFor="ticket-limit" className="block text-xs font-medium text-zinc-600">
            Total tickets for the event
          </label>
          <div className="flex gap-2">
            <input
              id="ticket-limit"
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              placeholder="Blank = no total limit"
              inputMode="numeric"
              className={`${INPUT_CLASS} min-w-0 flex-1`}
            />
            <button
              type="submit"
              disabled={busy || limitDraft.trim() === (ticketLimit ? String(ticketLimit.quantity) : "")}
              className="shrink-0 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
            >
              Save
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            {ticketLimit
              ? `${ticketLimit.sold} sold${ticketLimit.held > 0 ? ` · ${ticketLimit.held} held` : ""} of ${
                  ticketLimit.quantity
                } · ${ticketLimit.remaining === 0 ? "sold out" : `${ticketLimit.remaining} left`}`
              : "Shared by every tier. A tier's own quantity still applies inside it."}
          </p>
        </form>

        {tiers.length === 0 && (
          <p className="text-sm text-zinc-500">
            No tiers yet. Add one below and it appears on the event page immediately.
          </p>
        )}

        {tiers.map((t) =>
          editingId === t.id ? (
            <form
              key={t.id}
              onSubmit={saveTier}
              className="space-y-2 rounded-xl border border-amber-300 bg-amber-50/40 p-3"
            >
              <TierFields
                draft={editDraft}
                onChange={(patch) => setEditDraft((d) => ({ ...d, ...patch }))}
                idPrefix={`tier-${t.id}`}
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={busy || !editDraft.name.trim() || editDraft.price.trim() === ""}
                  className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
                >
                  {busy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingId(null)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-900">{t.name}</p>
                <p className="text-xs text-zinc-500">
                  {money(t.price_cents, t.currency)} · {t.sold} sold
                  {t.quantity !== null ? ` of ${t.quantity}` : " · unlimited"}
                  {t.remaining === 0 ? " · sold out" : ""}
                </p>
                {/* The window in the event's timezone, so a host reading this
                    from elsewhere sees the hours buyers will actually get. */}
                {windowLabel(t, zone) && (
                  <p className="text-xs text-zinc-400">
                    {windowLabel(t, zone)}
                    {!t.on_sale && t.remaining !== 0 ? " · not on sale now" : ""}
                  </p>
                )}
                {/* A hold is a checkout in progress, not a sale. Shown separately
                    so an abandoned cart doesn't read as revenue. */}
                {t.held > 0 && (
                  <p className="text-xs text-amber-600">
                    {t.held} held in checkout · frees up if unpaid
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                {/* Editable even once a tier has sales: a price or window
                    correction has to be possible mid-sale, and past orders keep
                    the amount they were charged. */}
                <button
                  onClick={() => startEditing(t)}
                  disabled={busy}
                  title="Edit name, price, cap and sales window"
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => send("DELETE", undefined, `?type_id=${t.id}`)}
                  disabled={busy || t.sold > 0}
                  title={
                    t.sold > 0
                      ? "Tiers with sales can't be deleted"
                      : t.held > 0
                      ? "Someone is checking out — this may fail until their hold clears"
                      : "Delete tier"
                  }
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          )
        )}

        <form onSubmit={addTier} className="space-y-2 rounded-xl border border-dashed border-zinc-300 p-3">
          <TierFields
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            idPrefix="new-tier"
          />
          <button
            type="submit"
            disabled={busy || !draft.name.trim() || draft.price.trim() === ""}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            Add tier
          </button>
        </form>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold tracking-wide text-zinc-700">Promo codes</h2>

        {promos.length === 0 && (
          <p className="text-sm text-zinc-500">
            No codes yet. Codes you add here work only on this event.
          </p>
        )}

        {promos.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3">
            <div className="min-w-0">
              <p className="truncate font-mono text-sm font-medium tracking-wider text-zinc-900">{p.code}</p>
              <p className="text-xs text-zinc-500">
                {p.label} · <span className="font-medium text-zinc-700">{promoUses(p.redeemed)}</span>
              </p>
            </div>
            <button
              onClick={() => removePromo(p.id)}
              disabled={busy}
              title="Stops new redemptions. Existing orders keep their discount."
              className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-50 disabled:opacity-40 transition-colors"
            >
              Remove
            </button>
          </div>
        ))}

        <form onSubmit={addPromo} className="space-y-2 rounded-xl border border-dashed border-zinc-300 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              aria-label="Promo code"
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="EARLYBIRD"
              required
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm uppercase tracking-wider focus:border-amber-400 focus:outline-none"
            />
            <select
              aria-label="Discount type"
              value={promoKind}
              onChange={(e) => setPromoKind(e.target.value as "percent" | "amount")}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            >
              <option value="percent">% off</option>
              <option value="amount">$ off</option>
            </select>
            <input
              aria-label={promoKind === "percent" ? "Percent off" : "Amount off in dollars"}
              value={promoValue}
              onChange={(e) => setPromoValue(e.target.value)}
              placeholder={promoKind === "percent" ? "25" : "5.00"}
              inputMode="decimal"
              required
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={busy || !promoCode.trim() || promoValue.trim() === ""}
            className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            Add code
          </button>
          {promoError && (
            <p role="alert" className="text-sm text-red-600">
              {promoError}
            </p>
          )}
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-zinc-700">
            Guest list {guests.length > 0 && <span className="font-normal text-zinc-400">({guests.length})</span>}
          </h2>
          {/* Desktop only: a downloaded file has nowhere useful to go on a
              phone, and the door workflow there is search-and-tap, not export.
              Always the whole list, never the current search — "download the
              guest list" that quietly gave you four of forty would be a trap. */}
          {guests.length > 0 && (
            <button
              onClick={downloadCsv}
              className="hidden shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 sm:inline-flex"
            >
              Download CSV
            </button>
          )}
        </div>

        {guests.length === 0 ? (
          <p className="text-sm text-zinc-500">No tickets sold yet.</p>
        ) : (
          <>
            {/* Name/code search is the door workflow — no camera needed. It
                sticks to the top on a phone: with a full house you are scrolling
                and searching in the same breath. Autocapitalise and autocorrect
                off, or iOS mangles both a door code and an email address. */}
            {/* top-[60px] parks this under SiteHeader, which is itself
                sticky top-0 and 60px tall on mobile — measured, not guessed. A
                lower z-index than the header's z-10 so it slides beneath rather
                than over it if that height ever changes. */}
            <div className="sticky top-[60px] z-[5] -mx-1 bg-slate-50 px-1 py-2 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or code"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
              />
            </div>
            {/* A phone showed the Name column and nothing else — tier, door
                code and the check-in button all sat off-screen behind a
                horizontal scroll, which is everything the door actually needs.
                Stacked cards below sm, the table from sm up. Same pattern as
                SongHistoryTable. */}
            <div className="space-y-2 sm:hidden">
              {filtered.map((g) => (
                <div
                  key={g.ticket_id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-zinc-900">{g.name}</p>
                      {g.is_leader && (
                        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          leader
                        </span>
                      )}
                      {!g.is_member && (
                        <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                          guest
                        </span>
                      )}
                      <OrderPosition guest={g} />
                    </div>
                    {g.email && <p className="truncate text-xs text-zinc-400">{g.email}</p>}
                    <p className="mt-1 truncate text-xs text-zinc-500">
                      <span className="font-mono tracking-wider text-zinc-700">{g.code}</span>
                      <span className="text-zinc-300"> · </span>
                      {g.tier}
                      {paidLabel(g) && (
                        <>
                          <span className="text-zinc-300"> · </span>
                          {paidLabel(g)}
                        </>
                      )}
                      {g.checked_in_at && (
                        <>
                          <span className="text-zinc-300"> · </span>
                          <span className="text-green-700">in at {doorTime(g.checked_in_at)}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <CheckInButton guest={g} onToggle={toggleCheckIn} />
                </div>
              ))}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs tracking-wide text-zinc-500">
                    <th className="py-2 pr-3 font-medium">Name</th>
                    <th className="py-2 pr-3 font-medium">Tier</th>
                    <th className="py-2 pr-3 font-medium">Code</th>
                    <th className="py-2 pr-3 font-medium">Paid</th>
                    <th className="py-2 font-medium text-right">Door</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((g) => (
                    <tr key={g.ticket_id} className="border-t border-zinc-100">
                      <td className="py-2 pr-3">
                        <span className="text-zinc-900">{g.name}</span>
                        {g.is_leader && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                            leader
                          </span>
                        )}
                        {!g.is_member && (
                          <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
                            guest
                          </span>
                        )}
                        {g.order_tickets > 1 && (
                          <span className="ml-2">
                            <OrderPosition guest={g} />
                          </span>
                        )}
                        {g.email && <p className="text-xs text-zinc-400">{g.email}</p>}
                      </td>
                      <td className="py-2 pr-3 text-zinc-600">{g.tier}</td>
                      <td className="py-2 pr-3 font-mono text-xs tracking-wider text-zinc-500">{g.code}</td>
                      <td className="py-2 pr-3 text-zinc-600">{paidLabel(g)}</td>
                      <td className="py-2 text-right">
                        <CheckInButton guest={g} onToggle={toggleCheckIn} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filtered.length === 0 && (
              <p className="py-3 text-sm text-zinc-500">No one matches “{search}”.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
