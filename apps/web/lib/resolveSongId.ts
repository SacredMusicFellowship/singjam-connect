import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@singjam/core";

// A song is addressed by its id or by any slug it has had: the current one, or
// an older one kept in song_slug_history after a title or credit change.
export async function resolveSongId(db: SupabaseClient, slugOrId: string): Promise<string | null> {
  if (isUuid(slugOrId)) return slugOrId;
  const { data, error } = await db.rpc("resolve_song_slug", { p_slug: slugOrId });
  if (error) throw error;
  return (data as string | null) ?? null;
}
