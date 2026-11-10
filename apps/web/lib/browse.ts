import { cache } from "react";
import {
  loadBrowseEntity as loadEntity,
  loadBrowseRelated as loadRelated,
  loadBrowseSongs as loadSongs,
  type BrowseKind,
} from "@singjam/core";
import { supabaseAnon } from "@/lib/supabase/anon";

export { BROWSE_LIMIT, type BrowseSongRow, type LinkedTag, type BrowseEntity, type BrowseRelatedGroup } from "@singjam/core";

// Public data, read without a session; cached per request so metadata and the page share one load.
export const loadBrowseEntity = cache((kind: BrowseKind, slug: string, traditional = false) => loadEntity(supabaseAnon(), kind, slug, { traditional }));
export const loadBrowseSongs = (songIds: string[]) => loadSongs(supabaseAnon(), songIds);
export const loadBrowseRelated = (songIds: string[], self: { kind: BrowseKind; slug: string }) => loadRelated(supabaseAnon(), songIds, self);
