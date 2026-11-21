import type { SupabaseClient } from "@supabase/supabase-js";
import { markAttending } from "@/lib/jamAttendance";

// A guest checkout deliberately asks for nothing but a name and an email, so a
// guest's tickets live on the order alone — jam_rsvps.user_id is NOT NULL, and
// there is no account to point it at. That leaves buyers paid up but invisible:
// not on the guest list, and unable to add to the set they came to play.
//
// When someone later signs up with the same address, this attaches what they
// already bought. The email is the one Supabase just authenticated, so matching
// on it is no weaker than the login itself.
//
// Idempotent: orders already carrying a buyer are filtered out, so a repeat call
// claims nothing twice. Returns the jams claimed, for the caller to redirect to.
export async function claimGuestTickets(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<string[]> {
  const { data: orders } = await admin
    .from("ticket_orders")
    .select("id, jam_id")
    .is("buyer_user_id", null)
    .eq("status", "paid")
    .ilike("buyer_email", email);

  if (!orders?.length) return [];

  const orderIds = orders.map((o) => o.id);

  await admin
    .from("ticket_orders")
    .update({ buyer_user_id: userId })
    .in("id", orderIds);

  await admin
    .from("tickets")
    .update({ holder_user_id: userId })
    .in("order_id", orderIds)
    .is("holder_user_id", null);

  // A leader added before they had an account becomes a member leader, so the
  // event page links their profile.
  await admin
    .from("jam_leaders")
    .update({ user_id: userId, email: null, name: null })
    .in("order_id", orderIds)
    .is("user_id", null);

  const jamIds = [...new Set(orders.map((o) => o.jam_id))];
  for (const jamId of jamIds) {
    await markAttending(admin, jamId, userId);
  }

  return jamIds;
}
