import type { SupabaseClient } from "@supabase/supabase-js";

// An email invite is bound to its recipient only when they sign up through
// that email's own link. Someone who signs in another way — Apple, the host's
// shareable link, the app — kept showing as a pending email on the host's list
// even after they RSVP'd. Matching on the address Supabase just authenticated
// is no weaker than the login itself (same rule as claimGuestTickets).
//
// Idempotent: only rows with no user yet are touched.
export async function claimEmailInvites(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: invites } = await admin
    .from("jam_invites")
    .select("id, jam_id")
    .is("invited_user_id", null)
    .ilike("invitee_email", pattern);
  if (!invites?.length) return;

  const jamIds = invites.map((i) => i.jam_id);
  const [{ data: held }, { data: hosted }] = await Promise.all([
    admin.from("jam_invites").select("id, jam_id").eq("invited_user_id", userId).in("jam_id", jamIds),
    admin.from("jams").select("id").eq("host_user_id", userId).in("id", jamIds),
  ]);
  const hostedIds = new Set((hosted ?? []).map((j) => j.id));
  const heldIds = new Set((held ?? []).map((r) => r.jam_id));

  // (jam_id, invited_user_id) is unique, so where they already hold an invite
  // the email row is a duplicate of it — drop it rather than leave it pending.
  const duplicates = invites.filter((i) => heldIds.has(i.jam_id)).map((i) => i.id);
  const claim = invites
    .filter((i) => !heldIds.has(i.jam_id) && !hostedIds.has(i.jam_id))
    .map((i) => i.id);

  if (duplicates.length) await admin.from("jam_invites").delete().in("id", duplicates);
  if (claim.length) {
    await admin
      .from("jam_invites")
      .update({ invited_user_id: userId, invitee_email: null })
      .in("id", claim)
      .is("invited_user_id", null);
  }
}
