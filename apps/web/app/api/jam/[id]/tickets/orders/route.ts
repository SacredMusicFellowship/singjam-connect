import { NextResponse } from "next/server";
import { fetchAllRows } from "@singjam/core";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManageJam } from "@/lib/jamAuthz";
import { resolveStripeFees, type FeeOrder } from "@/lib/stripeFees";

// The host's guest list and sales summary. Host or co-host only — this exposes
// buyer names, emails and amounts paid.

type TicketRow = {
  id: string;
  qr_token: string;
  holder_name: string | null;
  holder_email: string | null;
  checked_in_at: string | null;
  ticket_types: { name: string } | null;
  ticket_orders: {
    id: string;
    status: string;
    buyer_name: string | null;
    buyer_email: string | null;
    buyer_user_id: string | null;
    amount_cents: number;
    currency: string;
    paid_at: string | null;
  } | null;
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;

  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: jam } = await admin.from("jams").select("host_user_id").eq("id", jamId).maybeSingle();
  if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });

  // Official events belong to the org, so anyone who can host one can run any
  // of them — not only whoever created it. See lib/jamAuthz.ts.
  if (!(await canManageJam(admin, jamId, user.id))) {
    return NextResponse.json({ error: "Only the host can view ticket sales" }, { status: 403 });
  }

  // The full guest list, not a page of it — a capped fetch would silently drop
  // attendees off the end of the door list. Ordered on a unique tiebreaker so
  // rows can't shift across page boundaries.
  // Cast at the boundary: supabaseAdmin() is an untyped client, so it cannot
  // infer the shape of the embedded joins from the select string.
  const tickets = await fetchAllRows<TicketRow>(
    (from, to) =>
      admin
        .from("tickets")
        .select(
          `id, qr_token, holder_name, holder_email, checked_in_at,
           ticket_types(name),
           ticket_orders!inner(id, status, buyer_name, buyer_email, buyer_user_id, amount_cents, currency, paid_at)`
        )
        .eq("jam_id", jamId)
        .eq("ticket_orders.status", "paid")
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: TicketRow[] | null; error?: any }>
  );

  // Members bought without supplying a name, so resolve theirs from profiles.
  // display_name holds the first name only, so last_name has to be joined on or
  // a door list of regulars reads as "Ben", "Ben", "Sarah".
  const memberIds = [
    ...new Set(
      tickets.map((t) => t.ticket_orders?.buyer_user_id).filter((v): v is string => !!v)
    ),
  ];
  const profileNames = new Map<string, string>();
  if (memberIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, display_name, last_name, username")
      .in("id", memberIds);
    for (const p of profiles ?? []) {
      const full = [(p as any).display_name, (p as any).last_name].filter(Boolean).join(" ");
      profileNames.set(p.id, full || (p as any).username || "");
    }
  }

  // What each buyer paid is an order total, so every ticket row carries its
  // order's total and how many tickets that order covered.
  const ticketsPerOrder = new Map<string, number>();
  for (const t of tickets) {
    const id = t.ticket_orders!.id;
    ticketsPerOrder.set(id, (ticketsPerOrder.get(id) ?? 0) + 1);
  }

  const guests = tickets.map((t) => {
    const o = t.ticket_orders!;
    const name =
      t.holder_name ??
      o.buyer_name ??
      (o.buyer_user_id ? profileNames.get(o.buyer_user_id) || null : null);
    return {
      ticket_id: t.id,
      code: t.qr_token.replace(/-/g, "").slice(0, 6).toUpperCase(),
      name: name || "Guest",
      email: t.holder_email ?? o.buyer_email ?? null,
      tier: t.ticket_types?.name ?? "Ticket",
      is_member: !!o.buyer_user_id,
      checked_in_at: t.checked_in_at,
      order_id: o.id,
      paid_at: o.paid_at,
      order_amount_cents: o.amount_cents,
      order_tickets: ticketsPerOrder.get(o.id) ?? 1,
      currency: o.currency,
    };
  });

  guests.sort((a, b) => a.name.localeCompare(b.name) || a.ticket_id.localeCompare(b.ticket_id));

  // Revenue is summed per order, not per ticket, or a multi-ticket order counts
  // its total once for every ticket in it.
  const orderTotals = new Map<string, { amount: number; currency: string }>();
  for (const t of tickets) {
    const o = t.ticket_orders!;
    orderTotals.set(o.id, { amount: o.amount_cents, currency: o.currency });
  }
  const grossCents = [...orderTotals.values()].reduce((sum, o) => sum + o.amount, 0);

  // Refunded orders count too: Stripe keeps its fee when a charge is refunded,
  // so leaving them out would overstate the net.
  const feeOrders = await fetchAllRows<FeeOrder>(
    (from, to) =>
      admin
        .from("ticket_orders")
        .select("id, stripe_payment_intent_id, stripe_fee_cents")
        .eq("jam_id", jamId)
        .in("status", ["paid", "refunded"])
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: FeeOrder[] | null; error?: any }>
  );
  const { feeCents, pending: feesPending } = await resolveStripeFees(admin, feeOrders);

  return NextResponse.json({
    guests,
    summary: {
      tickets_sold: guests.length,
      orders: orderTotals.size,
      gross_cents: grossCents,
      fee_cents: feeCents,
      net_cents: grossCents - feeCents,
      fees_pending: feesPending,
      currency: [...orderTotals.values()][0]?.currency ?? "usd",
      checked_in: guests.filter((g) => g.checked_in_at).length,
    },
  });
}
