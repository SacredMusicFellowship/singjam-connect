import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The event's set list, but only once it has at least one song. The
 * confirmation page and the confirmation email both link to it as "See what
 * we're singing", which is a dead end on an empty set.
 */
export async function findSetWithSongs(
  admin: SupabaseClient,
  jamId: string
): Promise<{ id: string } | null> {
  const { data: set } = await admin.from("sets").select("id").eq("jam_id", jamId).maybeSingle();
  if (!set) return null;
  const { count } = await admin
    .from("set_songs")
    .select("id", { count: "exact", head: true })
    .eq("set_id", set.id);
  return (count ?? 0) > 0 ? set : null;
}
