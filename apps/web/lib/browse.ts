import { cache } from "react";
import {
  loadBrowseEntity as loadEntity,
  loadBrowseRelated as loadRelated,
  loadBrowseSongs as loadSongs,
  type BrowseKind,
  type FilterableSong,
} from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";

export { BROWSE_LIMIT, type BrowseSongRow, type LinkedTag, type BrowseEntity, type BrowseRelatedGroup } from "@singjam/core";

export type BrowseFilterMeta = FilterableSong & { song_id: string };

// Public data, read without a session; cached per request so metadata and the page share one load.
export const loadBrowseEntity = cache((kind: BrowseKind, slug: string) => loadEntity(supabaseAnon(), kind, slug));
export const loadBrowseSongs = (songIds: string[]) => loadSongs(supabaseAnon(), songIds);
export const loadBrowseRelated = (songIds: string[], self: { kind: BrowseKind; slug: string }) => loadRelated(supabaseAnon(), songIds, self);

// The filter fields (tags, vibe, key, meter, year) for just these songs.
export async function loadBrowseFilterMeta(songIds: string[]): Promise<BrowseFilterMeta[]> {
  if (songIds.length === 0) return [];
  const ids = new Set(songIds);
  const { data } = await supabaseAnon().rpc("song_filter_meta");
  return ((data ?? []) as BrowseFilterMeta[]).filter((m) => ids.has(m.song_id));
}
