import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@singjam/core";

type TicketRow = {
  holder_email: string | null;
  holder_name: string | null;
  ticket_orders: { buyer_email: string | null; buyer_name: string | null } | null;
};

// Guest checkout buyers are coming but have no jam_rsvps row (user_id is NOT
// NULL), so anything that reaches attendees through RSVPs misses them. Keyed
// on buyer email, as the guest list at api/jam/[id]/attendees/guests does, so
// one buyer with several tickets or orders is one recipient. Server-only:
// tickets are service_role-only and this returns emails.
export async function guestTicketBuyers(
  admin: SupabaseClient,
  jamId: string
): Promise<Map<string, string | null>> {
  const tickets = await fetchAllRows<TicketRow>(
    (from, to) =>
      admin
        .from("tickets")
        .select("holder_email, holder_name, ticket_orders!inner(status, buyer_email, buyer_name)")
        .eq("jam_id", jamId)
        .is("holder_user_id", null)
        .eq("ticket_orders.status", "paid")
        .order("id", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: TicketRow[] | null; error?: any }>
  );

  const buyers = new Map<string, string | null>();
  for (const t of tickets) {
    const email = (t.ticket_orders?.buyer_email ?? t.holder_email)?.trim().toLowerCase();
    if (email && !buyers.has(email)) {
      buyers.set(email, t.ticket_orders?.buyer_name ?? t.holder_name ?? null);
    }
  }
  return buyers;
}
