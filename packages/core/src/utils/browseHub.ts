import { fetchAllRows } from "./fetchAllRows";
import { browsePath, SHOW_MEDIUM_LABEL } from "./browsePaths";
import type { TagType } from "./songTags";

export type BrowseChip = { href: string; label: string; count: number };
export type BrowseHub = {
  sections: { type: TagType; title: string; chips: BrowseChip[] }[];
  writers: BrowseChip[];
  artists: BrowseChip[];
  shows: { medium: string; label: string; chips: BrowseChip[] }[];
};

const SECTIONS: { type: TagType; title: string; topLevelOnly: boolean }[] = [
  { type: "genre", title: "Genres", topLevelOnly: true },
  { type: "form", title: "Forms", topLevelOnly: false },
  { type: "occasion", title: "Occasions", topLevelOnly: true },
  { type: "community", title: "Communities", topLevelOnly: true },
  { type: "culture", title: "Cultures", topLevelOnly: false },
  { type: "language", title: "Languages", topLevelOnly: false },
  { type: "theme", title: "Themes", topLevelOnly: false },
];
const TOP_PEOPLE = 30;
const byCount = (a: BrowseChip, b: BrowseChip) => b.count - a.count || (a.label < b.label ? -1 : 1);

// Everything the /browse hub lists, with song counts (a tag counts what's below
// it too, via tag_song_counts in migration 206). Only entries with songs appear.
export async function loadBrowseHub(db: any): Promise<BrowseHub> {
  const [tags, { data: counts }, people, artists, { data: shows }] = await Promise.all([
    fetchAllRows<{ id: string; name: string; slug: string; type: TagType; is_top_level: boolean }>((f, t) =>
      db.from("tags").select("id, name, slug, type, is_top_level").order("id").range(f, t)
    ),
    db.rpc("tag_song_counts"),
    fetchAllRows<{ name: string; slug: string; song_composers: { count: number }[]; song_lyricists: { count: number }[] }>((f, t) =>
      db.from("people").select("name, slug, song_composers(count), song_lyricists(count)").order("id").range(f, t)
    ),
    fetchAllRows<{ name: string; slug: string; song_recording_artists: { count: number }[] }>((f, t) =>
      db.from("artists").select("name, slug, song_recording_artists(count)").order("id").range(f, t)
    ),
    db.from("productions").select("name, slug, year, medium, song_productions(count)").order("name").order("id"),
  ]);
  const songCount = new Map(((counts ?? []) as { tag_id: string; songs: number }[]).map((c) => [c.tag_id, c.songs]));

  const sections = SECTIONS.map((s) => ({
    type: s.type,
    title: s.title,
    chips: tags
      .filter((t) => t.type === s.type && (!s.topLevelOnly || t.is_top_level) && (songCount.get(t.id) ?? 0) > 0)
      .map((t) => ({ href: browsePath(t.type, t.slug), label: t.name, count: songCount.get(t.id) ?? 0 }))
      .sort(byCount),
  })).filter((s) => s.chips.length > 0);

  // A writer counts each song once even when credited for both music and words.
  const writers = people
    .filter((p) => p.name.toLowerCase() !== "traditional")
    .map((p) => ({ href: browsePath("person", p.slug), label: p.name, count: Math.max(p.song_composers[0]?.count ?? 0, p.song_lyricists[0]?.count ?? 0) }))
    .filter((c) => c.count > 1)
    .sort(byCount)
    .slice(0, TOP_PEOPLE);
  const recording = artists
    .map((a) => ({ href: browsePath("artist", a.slug), label: a.name, count: a.song_recording_artists[0]?.count ?? 0 }))
    .filter((c) => c.count > 1)
    .sort(byCount)
    .slice(0, TOP_PEOPLE);
  const byMedium = new Map<string, BrowseChip[]>();
  for (const s of (shows ?? []) as any[]) {
    const count = s.song_productions?.[0]?.count ?? 0;
    if (!count) continue;
    const key = s.medium ?? "other";
    byMedium.set(key, [...(byMedium.get(key) ?? []), { href: browsePath("show", s.slug), label: s.year ? `${s.name} (${s.year})` : s.name, count }]);
  }
  return {
    sections,
    writers,
    artists: recording,
    shows: [...byMedium].map(([medium, chips]) => ({ medium, label: SHOW_MEDIUM_LABEL[medium] ?? "Other", chips: chips.sort(byCount) })),
  };
}
