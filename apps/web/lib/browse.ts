import { cache } from "react";
import { loadBrowseEntity as loadEntity, loadBrowseSongs as loadSongs, type BrowseKind } from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";

export { BROWSE_LIMIT, type BrowseSongRow, type LinkedTag, type BrowseEntity } from "@singjam/core";

// Public data, read without a session; cached per request so metadata and the page share one load.
export const loadBrowseEntity = cache((kind: BrowseKind, slug: string) => loadEntity(supabaseAnon(), kind, slug));
export const loadBrowseSongs = (songIds: string[]) => loadSongs(supabaseAnon(), songIds);
