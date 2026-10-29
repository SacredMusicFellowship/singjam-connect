import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The event's set list, empty or not. The confirmation page and the
 * confirmation email both link to it as "View set list", so the two always
 * agree on whether the button is there.
 */
export async function findEventSet(
  admin: SupabaseClient,
  jamId: string
): Promise<{ id: string } | null> {
  const { data: set } = await admin.from("sets").select("id").eq("jam_id", jamId).maybeSingle();
  return set ?? null;
}
