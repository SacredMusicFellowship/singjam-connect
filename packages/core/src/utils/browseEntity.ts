import type { CardIdentity } from "./songSubtitle";
import { fetchAllRows } from "./fetchAllRows";
import { browsePath, SHOW_MEDIUM_LABEL, type BrowseKind } from "./browsePaths";
import type { TagType } from "./songTags";

export const BROWSE_LIMIT = 200;

export type BrowseSongRow = {
  song_id: string;
  title: string;
  slug: string | null;
  byline: string | null;
  card_identity?: CardIdentity;
  display_artist: string | null;
  composers: string[];
  cultures: string[];
  communities: string[];
  productions: string[];
  genres: string[];
  forms: string[];
  occasions: string[];
  languages: string[];
  recording_artists: { name: string; year: number | null }[] | null;
  production_credits: { name: string; year: number | null }[] | null;
  youtube_id: string | null;
  spotify_track_id: string | null;
  popularity: number;
};

export type LinkedTag = { name: string; slug: string; type: TagType };

export type BrowseEntity = {
  kind: BrowseKind;
  // A person's or artist's own slug, when the page was opened by name.
  slug?: string;
  name: string;
  subtitle: string | null;
  notes: string | null;
  parents: LinkedTag[];
  children: LinkedTag[];
  related: LinkedTag[];
  songIds: string[];
  // How each song relates to a person ("Music", "Words") or show.
  roles: Map<string, string>;
};

// Song cards link writers and artists by name (names are unique), so a person
// or artist page takes either its slug or the name.
async function bySlugOrName(db: any, table: "people" | "artists", columns: string, key: string): Promise<any | null> {
  const { data } = await db.from(table).select(columns).eq("slug", key).maybeSingle();
  if (data) return data;
  const { data: named } = await db.from(table).select(columns).eq("name", key).maybeSingle();
  return named ?? null;
}

// The songs and context for one browse page (migration 205). Public data; web
// reads it without a session, native with the app's client.
export async function loadBrowseEntity(db: any, kind: BrowseKind, slug: string): Promise<BrowseEntity | null> {
  if (kind === "person") {
    const person = await bySlugOrName(db, "people", "id, name, slug, notes", slug);
    if (!person) return null;
    const [composed, wrote] = await Promise.all([
      fetchAllRows<{ song_id: string }>((f: number, t: number) => db.from("song_composers").select("song_id").eq("person_id", person.id).order("song_id").range(f, t)),
      fetchAllRows<{ song_id: string }>((f: number, t: number) => db.from("song_lyricists").select("song_id").eq("person_id", person.id).order("song_id").range(f, t)),
    ]);
    const roles = new Map<string, string>();
    const music = new Set(composed.map((r) => r.song_id)), words = new Set(wrote.map((r) => r.song_id));
    for (const id of new Set([...music, ...words])) roles.set(id, music.has(id) && words.has(id) ? "Music & words" : music.has(id) ? "Music" : "Words");
    return { kind, slug: person.slug, name: person.name, subtitle: null, notes: person.notes ?? null, parents: [], children: [], related: [], songIds: [...roles.keys()], roles };
  }
  if (kind === "artist") {
    const artist = await bySlugOrName(db, "artists", "id, name, slug", slug);
    if (!artist) return null;
    const rows = await fetchAllRows<{ song_id: string; year: number | null }>((f: number, t: number) =>
      db.from("song_recording_artists").select("song_id, year").eq("artist_id", artist.id).order("song_id").range(f, t)
    );
    const roles = new Map(rows.map((r) => [r.song_id, r.year ? `Recorded ${r.year}` : "Recording"]));
    return { kind, slug: artist.slug, name: artist.name, subtitle: null, notes: null, parents: [], children: [], related: [], songIds: [...roles.keys()], roles };
  }
  if (kind === "show") {
    const { data: show } = await db.from("productions").select("id, name, year, medium").eq("slug", slug).maybeSingle();
    if (!show) return null;
    const rows = await fetchAllRows<{ song_id: string }>((f: number, t: number) =>
      db.from("song_productions").select("song_id").eq("production_id", show.id).order("song_id").range(f, t)
    );
    const medium = show.medium ? SHOW_MEDIUM_LABEL[show.medium] ?? null : null;
    return {
      kind, name: show.name, subtitle: [medium, show.year].filter(Boolean).join(" · ") || null, notes: null,
      parents: [], children: [], related: [], songIds: rows.map((r) => r.song_id), roles: new Map(),
    };
  }

  const { data: tag } = await db.from("tags").select("id, name, type, description").eq("type", kind).eq("slug", slug).maybeSingle();
  if (!tag) return null;
  const [{ data: links }, { data: descendants }] = await Promise.all([
    db.from("tag_relations").select("kind, tag_id, related_tag_id, a:tags!tag_relations_tag_id_fkey(name, slug, type), b:tags!tag_relations_related_tag_id_fkey(name, slug, type)")
      .or(`tag_id.eq.${tag.id},related_tag_id.eq.${tag.id}`),
    db.rpc("tag_descendants", { p_tag_ids: [tag.id] }),
  ]);
  const parents: LinkedTag[] = [], children: LinkedTag[] = [], related: LinkedTag[] = [];
  for (const l of (links ?? []) as any[]) {
    const other = l.tag_id === tag.id ? l.b : l.a;
    if (!other) continue;
    if (l.kind === "parent") (l.tag_id === tag.id ? parents : children).push(other);
    else related.push(other);
  }
  const byName = (a: LinkedTag, b: LinkedTag) => (a.name < b.name ? -1 : 1);
  const tagIds = ((descendants ?? []) as { tag_id: string }[]).map((d) => d.tag_id);
  const ids = tagIds.length ? tagIds : [tag.id];
  // Songs tagged directly, and songs whose tune or text carries the tag (a raga
  // or maqam usually belongs to the tune; a language or source to the text).
  const [rows, tuneRows, textRows] = await Promise.all([
    fetchAllRows<{ song_id: string }>((f: number, t: number) =>
      db.from("song_tags").select("song_id").in("tag_id", ids).order("song_id").order("tag_id").range(f, t)
    ),
    fetchAllRows<{ tune_id: string }>((f: number, t: number) =>
      db.from("tune_tags").select("tune_id").in("tag_id", ids).order("tune_id").order("tag_id").range(f, t)
    ),
    fetchAllRows<{ text_id: string }>((f: number, t: number) =>
      db.from("text_tags").select("text_id").in("tag_id", ids).order("text_id").order("tag_id").range(f, t)
    ),
  ]);
  const viaTunes = tuneRows.length
    ? await fetchAllRows<{ id: string }>((f: number, t: number) => db.from("songs").select("id").in("tune_id", [...new Set(tuneRows.map((r) => r.tune_id))]).order("id").range(f, t))
    : [];
  const viaTexts = textRows.length
    ? await fetchAllRows<{ id: string }>((f: number, t: number) => db.from("songs").select("id").in("text_id", [...new Set(textRows.map((r) => r.text_id))]).order("id").range(f, t))
    : [];
  return {
    kind, name: tag.name, subtitle: null, notes: tag.description ?? null,
    parents: parents.sort(byName), children: children.sort(byName), related: related.sort(byName),
    songIds: [...new Set([...rows.map((r) => r.song_id), ...viaTunes.map((r) => r.id), ...viaTexts.map((r) => r.id)])], roles: new Map(),
  };
}

// All of the page's songs, most-known first, as the Song Library orders them
// (browse_songs returns at most 200 rows a call, so this pages through).
export async function loadBrowseSongs(db: any, songIds: string[]): Promise<{ songs: BrowseSongRow[]; members: number }> {
  if (songIds.length === 0) return { songs: [], members: 0 };
  const songs: BrowseSongRow[] = [];
  const membersCall = db.rpc("members_knowing", { p_song_ids: songIds });
  for (let offset = 0; offset < songIds.length; offset += BROWSE_LIMIT) {
    const { data, error } = await db.rpc("browse_songs", { p_song_ids: songIds, p_limit: BROWSE_LIMIT, p_offset: offset, p_sort: "popularity" });
    if (error) throw error;
    songs.push(...((data ?? []) as BrowseSongRow[]));
    if ((data ?? []).length < BROWSE_LIMIT) break;
  }
  const { data: members } = await membersCall;
  return { songs, members: (members as number | null) ?? 0 };
}

export type BrowseRelatedChip = { href: string; label: string; count: number };
export type BrowseRelatedGroup = { key: string; title: string; chips: BrowseRelatedChip[] };

const RELATED_GROUPS: { key: string; kind: string; type: string | null; title: string }[] = [
  { key: "genre", kind: "tag", type: "genre", title: "Genres" },
  { key: "form", kind: "tag", type: "form", title: "Forms" },
  { key: "occasion", kind: "tag", type: "occasion", title: "Occasions" },
  { key: "community", kind: "tag", type: "community", title: "Communities" },
  { key: "person", kind: "person", type: null, title: "Songwriters" },
  { key: "artist", kind: "artist", type: null, title: "Recording artists" },
  { key: "show", kind: "show", type: null, title: "Shows" },
  { key: "culture", kind: "tag", type: "culture", title: "Cultures" },
  { key: "theme", kind: "tag", type: "theme", title: "Themes" },
];

// What's most common among a page's songs (browse_related, migration 207), as
// links onward: a songwriter's genres and co-writers, a genre's songwriters…
// The page's own entry is left out.
export async function loadBrowseRelated(db: any, songIds: string[], self: { kind: BrowseKind; slug: string }): Promise<BrowseRelatedGroup[]> {
  if (songIds.length === 0) return [];
  const { data } = await db.rpc("browse_related", { p_song_ids: songIds, p_limit: 8 });
  const rows = (data ?? []) as { kind: string; type: string | null; name: string; slug: string; songs: number }[];
  return RELATED_GROUPS.map((g) => ({
    key: g.key,
    title: g.title,
    chips: rows
      .filter((r) => r.kind === g.kind && r.type === g.type)
      .map((r) => {
        const kind = (r.kind === "tag" ? r.type : r.kind) as BrowseKind;
        return { kind, href: browsePath(kind, r.slug), label: r.name, count: r.songs, slug: r.slug };
      })
      .filter((c) => !(c.kind === self.kind && c.slug === self.slug))
      .map(({ href, label, count }) => ({ href, label, count })),
  })).filter((g) => g.chips.length > 0);
}
