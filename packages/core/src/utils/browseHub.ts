import { fetchAllRows } from "./fetchAllRows";
import { browsePath, SHOW_MEDIUM_LABEL } from "./browsePaths";
import type { TagType } from "./songTags";
import { NEW_TESTAMENT_BOOKS, TANAKH_BOOKS, scriptureBookSlug } from "./scripture";

export type BrowseChip = { href: string; label: string; count: number };
export type BrowseHub = {
  // chips: the top level (genres, occasions, communities) or everything; all: every tag with songs.
  sections: { type: TagType; title: string; chips: BrowseChip[]; all: BrowseChip[] }[];
  writers: BrowseChip[];
  writerTotal: number;
  artists: BrowseChip[];
  artistTotal: number;
  shows: { medium: string; label: string; chips: BrowseChip[] }[];
  // Cultures with their traditional songs (migration 213).
  traditional: BrowseChip[];
  // Books of scripture that songs' words set or paraphrase, in canonical order.
  scripture: BrowseChip[];
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
  const [tags, { data: counts }, people, artists, { data: shows }, { data: tradCounts }, scripture] = await Promise.all([
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
    db.rpc("traditional_culture_counts"),
    scriptureChips(db),
  ]);
  const songCount = new Map(((counts ?? []) as { tag_id: string; songs: number }[]).map((c) => [c.tag_id, c.songs]));

  const sections = SECTIONS.map((s) => {
    const withSongs = tags.filter((t) => t.type === s.type && (songCount.get(t.id) ?? 0) > 0);
    const chip = (t: (typeof tags)[number]) => ({ href: browsePath(t.type, t.slug), label: t.name, count: songCount.get(t.id) ?? 0 });
    return {
      type: s.type,
      title: s.title,
      chips: withSongs.filter((t) => !s.topLevelOnly || t.is_top_level).map(chip).sort(byCount),
      all: withSongs.map(chip).sort(byCount),
    };
  }).filter((s) => s.all.length > 0);

  const allWriters = writerChips(people);
  const allArtists = artistChips(artists);
  const writers = allWriters.filter((c) => c.count > 1).sort(byCount).slice(0, TOP_PEOPLE);
  const recording = allArtists.filter((c) => c.count > 1).sort(byCount).slice(0, TOP_PEOPLE);
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
    writerTotal: allWriters.length,
    artists: recording,
    artistTotal: allArtists.length,
    shows: [...byMedium].map(([medium, chips]) => ({ medium, label: SHOW_MEDIUM_LABEL[medium] ?? "Other", chips: chips.sort(byCount) })),
    traditional: ((tradCounts ?? []) as { name: string; slug: string; song_count: number }[])
      .map((c) => ({ href: browsePath("culture", c.slug, { traditional: true }), label: c.name, count: Number(c.song_count) }))
      .sort(byCount),
    scripture,
  };
}

const CANON = [...TANAKH_BOOKS, ...NEW_TESTAMENT_BOOKS];

// Each book counts its songs once, however many of its passages they set.
async function scriptureChips(db: any): Promise<BrowseChip[]> {
  const sources = await fetchAllRows<{ text_id: string; book: string | null; relation: string }>((f, t) =>
    db.from("text_sources").select("text_id, book, relation").not("book", "is", null).order("id").range(f, t)
  );
  const textIds = [...new Set(sources.map((s) => s.text_id))];
  if (!textIds.length) return [];
  const songs = await fetchAllRows<{ id: string; text_id: string }>((f, t) =>
    db.from("songs").select("id, text_id").in("text_id", textIds).order("id").range(f, t)
  );
  const songsByText = new Map<string, string[]>();
  for (const s of songs) songsByText.set(s.text_id, [...(songsByText.get(s.text_id) ?? []), s.id]);
  const byBook = new Map<string, Set<string>>();
  for (const s of sources) {
    if (!s.book || !CANON.includes(s.book)) continue;
    const set = byBook.get(s.book) ?? new Set<string>();
    for (const id of songsByText.get(s.text_id) ?? []) set.add(id);
    byBook.set(s.book, set);
  }
  return CANON.filter((b) => (byBook.get(b)?.size ?? 0) > 0)
    .map((b) => ({ href: browsePath("scripture", scriptureBookSlug(b)), label: b, count: byBook.get(b)!.size }));
}

type PersonRow = { name: string; slug: string; song_composers: { count: number }[]; song_lyricists: { count: number }[] };
type ArtistRow = { name: string; slug: string; song_recording_artists: { count: number }[] };

// A writer counts each song once even when credited for both music and words.
function writerChips(people: PersonRow[]): BrowseChip[] {
  return people
    .filter((p) => p.name.toLowerCase() !== "traditional")
    .map((p) => ({ href: browsePath("person", p.slug), label: p.name, count: Math.max(p.song_composers[0]?.count ?? 0, p.song_lyricists[0]?.count ?? 0) }))
    .filter((c) => c.count > 0);
}

function artistChips(artists: ArtistRow[]): BrowseChip[] {
  return artists
    .map((a) => ({ href: browsePath("artist", a.slug), label: a.name, count: a.song_recording_artists[0]?.count ?? 0 }))
    .filter((c) => c.count > 0);
}

// Every songwriter or recording artist with songs, A–Z: the /people and /artists index pages.
export async function loadBrowseIndex(db: any, kind: "person" | "artist"): Promise<BrowseChip[]> {
  const chips = kind === "person"
    ? writerChips(await fetchAllRows<PersonRow>((f, t) => db.from("people").select("name, slug, song_composers(count), song_lyricists(count)").order("id").range(f, t)))
    : artistChips(await fetchAllRows<ArtistRow>((f, t) => db.from("artists").select("name, slug, song_recording_artists(count)").order("id").range(f, t)));
  return chips.sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
}

export type BrowseHubOrder = "count" | "az";

// The hub as listed: most songs first (as loaded), or A–Z.
export function sortBrowseHub(hub: BrowseHub, order: BrowseHubOrder): BrowseHub {
  if (order === "count") return hub;
  const az = (chips: BrowseChip[]) => [...chips].sort((a, b) => a.label.localeCompare(b.label));
  return {
    ...hub,
    sections: hub.sections.map((s) => ({ ...s, chips: az(s.chips), all: az(s.all) })),
    writers: az(hub.writers),
    artists: az(hub.artists),
    shows: hub.shows.map((g) => ({ ...g, chips: az(g.chips) })),
    traditional: az(hub.traditional),
  };
}
