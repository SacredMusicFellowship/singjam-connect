import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePromoCode } from "@/lib/promoCode";
import { coverageFeeCents } from "@/lib/ticketFees";
import { summarisePaymentLines, type PaymentLine } from "@/lib/ticketPaymentState";

// The payment page as `next dev` shows it: built from the tiers, quantities and
// promo code the buyer picked, without reserving stock or creating a Checkout
// Session, so pressing Buy locally leaves the production event untouched.
// Everything here is a read.

export type PreviewItem = { ticket_type_id: string; quantity: number };

export type CheckoutPreview =
  | { error: string }
  | { lines: PaymentLine[]; discountCents: number; amountCents: number; currency: string };

export async function buildCheckoutPreview(
  admin: SupabaseClient,
  jamId: string,
  eventName: string | null,
  items: PreviewItem[],
  promoCode: string,
  coverFees: boolean,
): Promise<CheckoutPreview> {
  const wanted = items.filter((i) => Number.isInteger(i.quantity) && i.quantity > 0);
  if (wanted.length === 0) return { error: "No tickets selected" };

  const { data: types } = await admin
    .from("ticket_types")
    .select("id, name, price_cents, currency")
    .eq("jam_id", jamId)
    .in("id", wanted.map((i) => i.ticket_type_id));
  const byId = new Map(((types ?? []) as any[]).map((t) => [t.id, t]));
  if (wanted.some((i) => !byId.has(i.ticket_type_id))) return { error: "Those tickets aren't on sale" };

  const currency: string = byId.get(wanted[0].ticket_type_id).currency;
  const subtotalCents = wanted.reduce((sum, i) => sum + byId.get(i.ticket_type_id).price_cents * i.quantity, 0);

  let discountCents = 0;
  if (promoCode) {
    const resolved = await resolvePromoCode(admin, jamId, promoCode, subtotalCents, currency);
    if ("error" in resolved) return { error: "Could not check that code" };
    if (!resolved.valid) return { error: resolved.reason };
    discountCents = resolved.discountCents;
  }

  const discountedCents = subtotalCents - discountCents;
  const feeCents = coverFees ? coverageFeeCents(discountedCents) : 0;

  // Described the way checkout names Stripe's line items, so the labels come out
  // exactly as on the real page.
  const lines = summarisePaymentLines(
    [
      ...wanted.map((i) => {
        const t = byId.get(i.ticket_type_id);
        return { description: `${eventName ?? "Event"} — ${t.name}`, quantity: i.quantity, amount_total: t.price_cents * i.quantity };
      }),
      ...(feeCents > 0 ? [{ description: "Processing fee", quantity: 1, amount_total: feeCents }] : []),
    ],
    eventName ?? "Event",
  );

  return { lines, discountCents, amountCents: discountedCents + feeCents, currency };
}

export function previewUrl(
  jamId: string,
  step: "pay" | "complete",
  items: PreviewItem[],
  promoCode: string,
  coverFees: boolean,
): string {
  const q = new URLSearchParams({ preview: items.map((i) => `${i.ticket_type_id}:${i.quantity}`).join(",") });
  if (promoCode) q.set("promo", promoCode);
  if (coverFees) q.set("cover", "1");
  return `/jam/${jamId}/tickets/${step}?${q}`;
}

export function parsePreviewItems(preview: string): PreviewItem[] {
  return preview.split(",").map((part) => {
    const [ticket_type_id, qty] = part.split(":");
    return { ticket_type_id, quantity: Number(qty) };
  });
}
