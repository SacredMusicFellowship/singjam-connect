// Songs and jams are tagged through one shared tag graph (migration 202):
// song_tags / jam_tags rows point at tags, each with a type. These helpers turn
// the rows Supabase returns for SONG_TAGS_SELECT / JAM_TAGS_SELECT into the
// per-type name lists the apps display, so web and native read tags the same way.

export const TAG_TYPES = ["genre", "theme", "culture", "language", "form", "occasion", "community"] as const;
export type TagType = (typeof TAG_TYPES)[number];
export type TagContext = "general" | "music" | "lyrics";

export const TAG_TYPE_LABELS: Record<TagType, string> = {
  genre: "Genres",
  theme: "Themes",
  culture: "Cultures",
  language: "Languages",
  form: "Forms",
  occasion: "Occasions",
  community: "Communities",
};

export type TagRef = { id?: string; name: string; type: string; slug?: string };
export type SongTagRow = { context?: string | null; tags: TagRef | null };
export type JamTagRow = { tags: TagRef | null };

export const SONG_TAGS_SELECT = "song_tags(context, tags(id, name, type, slug))";
export const JAM_TAGS_SELECT = "jam_tags(tags(id, name, type))";

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

// The names of one type's tags, A–Z, each once. `context` narrows to general
// tags or to where a traditional song's melody ("music") or words ("lyrics")
// come from; by default every context counts.
export function songTagNames(
  rows: SongTagRow[] | null | undefined,
  type: TagType,
  context: TagContext | "any" = "any"
): string[] {
  const names = new Set<string>();
  for (const r of rows ?? []) {
    if (r.tags?.type !== type) continue;
    if (context !== "any" && (r.context ?? "general") !== context) continue;
    names.add(r.tags.name);
  }
  return [...names].sort(byName);
}

// Where a traditional song's melody or words come from, if set.
export function songTraditionTag(rows: SongTagRow[] | null | undefined, context: "music" | "lyrics"): TagRef | null {
  const row = (rows ?? []).find((r) => r.context === context && r.tags);
  return row?.tags ? { name: row.tags.name, type: row.tags.type } : null;
}

export function jamTags(rows: JamTagRow[] | null | undefined, type?: TagType): TagRef[] {
  return (rows ?? [])
    .map((r) => r.tags)
    .filter((t): t is TagRef => !!t && (!type || t.type === type))
    .sort((a, b) => byName(a.name, b.name));
}

// One type's tags with their slugs (for links to browse pages), A–Z, each once.
export function songTagRefs(rows: SongTagRow[] | null | undefined, type: TagType): { name: string; slug: string | null }[] {
  const byNameMap = new Map<string, string | null>();
  for (const r of rows ?? []) {
    if (r.tags?.type === type && !byNameMap.has(r.tags.name)) byNameMap.set(r.tags.name, r.tags.slug ?? null);
  }
  return [...byNameMap].map(([name, slug]) => ({ name, slug })).sort((a, b) => byName(a.name, b.name));
}
