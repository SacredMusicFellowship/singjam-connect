import type { SupabaseClient } from "@supabase/supabase-js";

// An email invite is bound to its recipient only when they sign up through
// that email's own link. Someone who signs in another way — Apple, the host's
// shareable link, the app — kept showing as a pending email on the host's list
// (jams) or never got access at all (sets). Matching on the address Supabase
// just authenticated is no weaker than the login itself (same rule as
// claimGuestTickets).
//
// Idempotent: only rows with no user yet are touched.
export async function claimEmailInvites(
  admin: SupabaseClient,
  userId: string,
  email: string,
): Promise<void> {
  const pattern = email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  await Promise.all([
    claimJamEmailInvites(admin, userId, pattern),
    claimSetEmailInvites(admin, userId, pattern),
  ]);
}

// `pattern` is an ilike pattern with wildcards already escaped.
export async function claimJamEmailInvites(
  admin: SupabaseClient,
  userId: string,
  pattern: string,
): Promise<void> {
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
  const { keep, extra } = firstPer(invites, (i) => i.jam_id);
  const duplicates = [...extra, ...keep.filter((i) => heldIds.has(i.jam_id)).map((i) => i.id)];
  const claim = keep
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

// Set invites have no accept step — opening the link grants access with the
// role the owner chose — so claiming by email grants it the same way.
export async function claimSetEmailInvites(
  admin: SupabaseClient,
  userId: string,
  pattern: string,
): Promise<void> {
  const { data: invites } = await admin
    .from("set_collaborators")
    .select("id, set_id")
    .is("user_id", null)
    .eq("status", "pending")
    .ilike("invitee_email", pattern);
  if (!invites?.length) return;

  const setIds = invites.map((i) => i.set_id);
  const [{ data: held }, { data: owned }] = await Promise.all([
    admin.from("set_collaborators").select("set_id").eq("user_id", userId).eq("status", "accepted").in("set_id", setIds),
    admin.from("sets").select("id").eq("owner_user_id", userId).in("id", setIds),
  ]);
  const heldIds = new Set((held ?? []).map((r) => r.set_id));
  const ownedIds = new Set((owned ?? []).map((s) => s.id));

  // Already a collaborator (one accepted row per user is enforced), or the
  // owner: the invite has nothing left to grant, so retire its token.
  const { keep, extra } = firstPer(invites, (i) => i.set_id);
  const stale = [...extra, ...keep.filter((i) => heldIds.has(i.set_id) || ownedIds.has(i.set_id)).map((i) => i.id)];
  const claim = keep
    .filter((i) => !heldIds.has(i.set_id) && !ownedIds.has(i.set_id))
    .map((i) => i.id);

  if (stale.length) await admin.from("set_collaborators").delete().in("id", stale);
  if (claim.length) {
    await admin
      .from("set_collaborators")
      .update({ user_id: userId, status: "accepted", invitee_email: null })
      .in("id", claim)
      .is("user_id", null);
  }
}

// The same address can be invited twice to one jam or set; binding both rows
// to one user would break the per-user unique index and fail the whole update.
function firstPer<T extends { id: string }>(rows: T[], key: (row: T) => string) {
  const seen = new Set<string>();
  const keep: T[] = [];
  const extra: string[] = [];
  for (const row of rows) {
    if (seen.has(key(row))) extra.push(row.id);
    else { seen.add(key(row)); keep.push(row); }
  }
  return { keep, extra };
}
