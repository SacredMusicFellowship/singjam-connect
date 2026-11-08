import { fetchAllRows } from "./fetchAllRows";
import { SHOW_MEDIUM_LABEL, type BrowseKind } from "./browsePaths";
import type { TagType } from "./songTags";

export const BROWSE_LIMIT = 200;

export type BrowseSongRow = {
  song_id: string;
  title: string;
  slug: string | null;
  byline: string | null;
  display_artist: string | null;
  production_credits: { name: string; year: number | null }[] | null;
  popularity: number;
};

export type LinkedTag = { name: string; slug: string; type: TagType };

export type BrowseEntity = {
  kind: BrowseKind;
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

// The songs and context for one browse page (migration 205). Public data; web
// reads it without a session, native with the app's client.
export async function loadBrowseEntity(db: any, kind: BrowseKind, slug: string): Promise<BrowseEntity | null> {
  if (kind === "person") {
    const { data: person } = await db.from("people").select("id, name, notes").eq("slug", slug).maybeSingle();
    if (!person) return null;
    const [composed, wrote] = await Promise.all([
      fetchAllRows<{ song_id: string }>((f: number, t: number) => db.from("song_composers").select("song_id").eq("person_id", person.id).order("song_id").range(f, t)),
      fetchAllRows<{ song_id: string }>((f: number, t: number) => db.from("song_lyricists").select("song_id").eq("person_id", person.id).order("song_id").range(f, t)),
    ]);
    const roles = new Map<string, string>();
    const music = new Set(composed.map((r) => r.song_id)), words = new Set(wrote.map((r) => r.song_id));
    for (const id of new Set([...music, ...words])) roles.set(id, music.has(id) && words.has(id) ? "Music & words" : music.has(id) ? "Music" : "Words");
    return { kind, name: person.name, subtitle: null, notes: person.notes ?? null, parents: [], children: [], related: [], songIds: [...roles.keys()], roles };
  }
  if (kind === "artist") {
    const { data: artist } = await db.from("artists").select("id, name").eq("slug", slug).maybeSingle();
    if (!artist) return null;
    const rows = await fetchAllRows<{ song_id: string; year: number | null }>((f: number, t: number) =>
      db.from("song_recording_artists").select("song_id, year").eq("artist_id", artist.id).order("song_id").range(f, t)
    );
    const roles = new Map(rows.map((r) => [r.song_id, r.year ? `Recorded ${r.year}` : "Recording"]));
    return { kind, name: artist.name, subtitle: null, notes: null, parents: [], children: [], related: [], songIds: [...roles.keys()], roles };
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
  const rows = await fetchAllRows<{ song_id: string }>((f: number, t: number) =>
    db.from("song_tags").select("song_id").in("tag_id", tagIds.length ? tagIds : [tag.id]).order("song_id").order("tag_id").range(f, t)
  );
  return {
    kind, name: tag.name, subtitle: null, notes: tag.description ?? null,
    parents: parents.sort(byName), children: children.sort(byName), related: related.sort(byName),
    songIds: [...new Set(rows.map((r) => r.song_id))], roles: new Map(),
  };
}

// The page's songs, most-known first, as the Song Library orders them.
export async function loadBrowseSongs(db: any, songIds: string[]): Promise<{ songs: BrowseSongRow[]; members: number }> {
  if (songIds.length === 0) return { songs: [], members: 0 };
  const [{ data: songs }, { data: members }] = await Promise.all([
    db.rpc("browse_songs", { p_song_ids: songIds, p_limit: BROWSE_LIMIT, p_sort: "popularity" }),
    db.rpc("members_knowing", { p_song_ids: songIds }),
  ]);
  return { songs: (songs ?? []) as BrowseSongRow[], members: (members as number | null) ?? 0 };
}
