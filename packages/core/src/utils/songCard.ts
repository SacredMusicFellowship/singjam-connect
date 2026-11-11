import type { TagType } from "./songTags";

// What a song card shows, shared by web's SongCard and native's SuggestionCard
// so search, browse, suggestions and the set panel all show the same card.

// The slug the database gives a tag name (tag_slug in migration 202), so card
// pills can link to browse pages from the name alone.
export function tagSlug(name: string): string {
  return name
    .replace(/&/g, " and ")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export type CardPill = { type: TagType; name: string; slug: string };

// Up to `max` pills that say what a song is: its form first (Hymn, Nigun), then
// occasion, genre and community, then its language when that isn't English.
export function songCardPills(
  tags: { forms?: string[] | null; occasions?: string[] | null; genres?: string[] | null; communities?: string[] | null; languages?: string[] | null },
  max = 3
): CardPill[] {
  const ordered: [TagType, string[]][] = [
    ["form", tags.forms ?? []],
    ["occasion", tags.occasions ?? []],
    ["genre", tags.genres ?? []],
    ["community", tags.communities ?? []],
    ["language", (tags.languages ?? []).filter((l) => l !== "English")],
  ];
  const out: CardPill[] = [];
  // One of each kind first, so a hymn shows Hymn · Gospel · Christian rather than three genres.
  for (const [type, names] of ordered) if (names[0] && out.length < max) out.push({ type, name: names[0], slug: tagSlug(names[0]) });
  for (const [type, names] of ordered) {
    for (const name of names.slice(1)) if (out.length < max) out.push({ type, name, slug: tagSlug(name) });
  }
  return out;
}

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// The alternate titles worth showing: only when the search matched one of them
// and not the title itself ("Nettleton" finds Come Thou Fount → aka Nettleton).
export function matchedAlternateTitles(aka: string[] | null | undefined, query: string, title: string): string[] {
  const q = fold(query);
  if (!q || fold(title).includes(q)) return [];
  return (aka ?? []).filter((a) => fold(a).includes(q));
}
