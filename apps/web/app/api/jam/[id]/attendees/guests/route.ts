import { NextResponse } from "next/server";
import { fetchAllRows } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";

// Who is coming that jam_rsvps cannot express, in two parts.
//
// `guests` — ticket buyers without an account. They are coming, so they belong
// on the list, but jam_rsvps.user_id is NOT NULL and references profiles, and
// tickets is service_role-only so the browser cannot read them directly.
//
// `members` — how many tickets an account holder bought beyond their own seat.
// A member's RSVP row counts them once however many tickets they hold, so a
// couple buying two seats registered as one person going while a guest buying
// two registered as two. Same purchase, different headcount, and wrong in the
// direction that under-plans a room.
//
// Names only, and only for guests: members are returned as ids, since the
// caller already has their profiles. The door list at ../../tickets/orders
// carries emails and codes and is host-gated; this one is not, so it must never
// grow those fields. buyer_email is read here purely as a grouping key and is
// never returned. Tickets exist only on official events, whose "going" list is
// already public, so nothing new is exposed.

type TicketRow = {
  order_id: string;
  holder_user_id: string | null;
  holder_name: string | null;
  ticket_orders: {
    status: string;
    buyer_name: string | null;
    buyer_email: string | null;
  } | null;
};

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const admin = supabaseAdmin();

  const { data: jam } = await admin.from("jams").select("id").eq("id", jamId).maybeSingle();
  if (!jam) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // The whole list, not a page of it — a cap would silently drop guests off the
  // end. Ordered on a unique tiebreaker so rows can't shift between pages.
  const tickets = await fetchAllRows<TicketRow>(
    (from, to) =>
      admin
        .from("tickets")
        .select(
          "id, order_id, holder_user_id, holder_name, ticket_orders!inner(status, buyer_name, buyer_email)"
        )
        .eq("jam_id", jamId)
        .eq("ticket_orders.status", "paid")
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: TicketRow[] | null; error?: any }>
  );

  // Guests: one entry per buyer, not per ticket and not per order. Per ticket
  // would list one name four times, which reads as a bug rather than a party.
  // Per order was nearly right but split anyone who came back and bought again,
  // showing the same name twice — so buyers are keyed on their email, falling
  // back to the order when there isn't one.
  const byBuyer = new Map<string, { name: string; tickets: number }>();
  // Members: count every ticket they hold; the seat their RSVP already accounts
  // for is subtracted at the end.
  const byMember = new Map<string, number>();

  for (const t of tickets) {
    if (t.holder_user_id) {
      byMember.set(t.holder_user_id, (byMember.get(t.holder_user_id) ?? 0) + 1);
      continue;
    }
    const key = t.ticket_orders?.buyer_email?.trim().toLowerCase() || `order:${t.order_id}`;
    const existing = byBuyer.get(key);
    if (existing) {
      existing.tickets += 1;
      continue;
    }
    byBuyer.set(key, {
      name: t.holder_name ?? t.ticket_orders?.buyer_name ?? "Guest",
      tickets: 1,
    });
  }

  return NextResponse.json({
    guests: [...byBuyer.values()].map((g) => ({ name: g.name, extra: g.tickets - 1 })),
    // Only the surplus is useful, and only when there is one. Added as its own
    // key rather than folded into `guests` so an older client that knows
    // nothing about it keeps working unchanged.
    members: [...byMember.entries()]
      .filter(([, count]) => count > 1)
      .map(([user_id, count]) => ({ user_id, extra: count - 1 })),
  });
}
