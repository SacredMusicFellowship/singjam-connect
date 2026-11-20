import { browsePath, KIND_LABEL } from "./browsePaths";

export const ENTITY_SEARCH_LIMIT = 5;

export type BrowseEntityMatch = { kind: "person" | "artist" | "show" | "tune" | "text"; key: string; name: string; song_count: number };
export type BrowseEntityRow = { id: string; href: string; name: string; detail: string };

// A Song Library search row linking a browse page: "Woody Guthrie",
// "Songwriter · 7 songs". href is the web path (native maps it with nativeBrowseHref).
export function browseEntityRow(m: BrowseEntityMatch): BrowseEntityRow {
  return {
    id: `${m.kind}:${m.key}`,
    href: browsePath(m.kind, m.key),
    name: m.name,
    detail: `${KIND_LABEL[m.kind]} · ${m.song_count} song${m.song_count === 1 ? "" : "s"}`,
  };
}

// Tunes, texts, songwriters, recording artists and shows whose names match
// (search_browse_entities, migration 241), best match first.
export async function searchBrowseEntities(db: any, q: string): Promise<BrowseEntityRow[]> {
  const trimmed = q.trim();
  if (!trimmed) return [];
  const { data, error } = await db.rpc("search_browse_entities", { q: trimmed, limit_n: ENTITY_SEARCH_LIMIT });
  if (error) throw error;
  return ((data ?? []) as BrowseEntityMatch[]).map(browseEntityRow);
}
