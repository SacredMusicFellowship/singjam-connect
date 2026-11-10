import type { CardCredit, CardIdentity } from "./songSubtitle";
import {
  capitalizeFirst, formatScriptureRef, formatSourceRef, scriptureBookFromSlug, scriptureBookSlug, scriptureKey, scriptureReadUrl,
  sortSources, NEW_TESTAMENT_BOOKS, TANAKH_BOOKS, type SourceRef,
} from "./scripture";
import type { BrowseChip } from "./browseHub";
import { fetchAllRows } from "./fetchAllRows";
import { browsePath, SHOW_MEDIUM_LABEL, type BrowseKind } from "./browsePaths";
import type { TagType } from "./songTags";
import { formatYear } from "./yearDisplay";

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

// A chip linking another browse page: a tag, or (on scripture pages) a book or chapter.
export type LinkedTag = { name: string; slug: string; type: TagType | "scripture" };

export type BrowseEntity = {
  kind: BrowseKind;
  // A person's or artist's own slug, when the page was opened by name.
  slug?: string;
  // Shown above the name in place of the kind ("Songwriter").
  label?: string;
  // Narrowed to its traditional songs; allSongCount is the page's full count.
  traditionalOnly?: boolean;
  allSongCount?: number;
  name: string;
  subtitle: string | null;
  // Tunes and texts: one line of linked facts under the name, in a fixed order
  // (culture or community · year · source · writers · meter or language);
  // groups show " · " apart, names in a group ", " apart (as song credit lines).
  facts?: CardCredit[][];
  // A text's sources when one line can't hold them (several, or an inspiration).
  sources?: CardCredit[];
  // A passage's page links out to read it.
  readUrl?: { href: string; site: string } | null;
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
// reads it without a session, native with the app's client. `traditional`
// keeps only songs credited to "Traditional".
export async function loadBrowseEntity(db: any, kind: BrowseKind, slug: string, opts: { traditional?: boolean } = {}): Promise<BrowseEntity | null> {
  const entity = await loadEntity(db, kind, slug);
  if (!entity || !opts.traditional) return entity;
  const { data: trad } = await db.from("people").select("id").eq("name", "Traditional").maybeSingle();
  const tradIds = new Set<string>();
  if (trad) {
    const [composed, wrote] = await Promise.all([
      fetchAllRows<{ song_id: string }>((f: number, t: number) => db.from("song_composers").select("song_id").eq("person_id", trad.id).order("song_id").range(f, t)),
      fetchAllRows<{ song_id: string }>((f: number, t: number) => db.from("song_lyricists").select("song_id").eq("person_id", trad.id).order("song_id").range(f, t)),
    ]);
    for (const r of [...composed, ...wrote]) tradIds.add(r.song_id);
  }
  return { ...entity, traditionalOnly: true, allSongCount: entity.songIds.length, songIds: entity.songIds.filter((id) => tradIds.has(id)) };
}

async function loadEntity(db: any, kind: BrowseKind, slug: string): Promise<BrowseEntity | null> {
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
    if (person.name === "Traditional") {
      return {
        kind, slug: person.slug, label: "Browse", name: "Traditional songs", subtitle: "Songs passed down without a known writer",
        notes: person.notes ?? null, parents: [], children: [], related: [], songIds: [...roles.keys()], roles: new Map(),
      };
    }
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

  if (kind === "tune") {
    const { data: tune } = await db.from("tunes")
      .select("id, slug, tune_label, meter, year, year_precision, published_in, notes, tune_credits(role, people(name, slug)), tune_tags(tags(name, slug, type))")
      .eq("slug", slug).maybeSingle();
    if (!tune) return null;
    const songs = await fetchAllRows<{ id: string }>((f: number, t: number) => db.from("songs").select("id").eq("tune_id", tune.id).order("id").range(f, t));
    const tags = ((tune.tune_tags ?? []) as any[]).map((t) => t.tags).filter(Boolean) as LinkedTag[];
    const { origin, rest } = splitOrigin(tags);
    const credits = ((tune.tune_credits ?? []) as any[]).filter((c) => c.people && c.people.name !== tune.tune_label);
    return {
      kind, name: tune.tune_label, subtitle: null,
      facts: [
        origin.map(tagFact),
        when(formatYear(tune.year, tune.year_precision)),
        when(tune.published_in),
        writerFacts(credits, { composer: "", arranger: "arr. ", adapter: "adapted by " }),
        when(tune.meter),
      ].filter((g) => g.length),
      notes: tune.notes ?? null, parents: [], children: [], related: rest,
      songIds: songs.map((r) => r.id), roles: new Map(),
    };
  }
  if (kind === "text") {
    const { data: text } = await db.from("texts")
      .select("id, title, year, year_precision, notes, text_credits(role, people(name, slug)), text_sources(id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation), text_tags(tags(name, slug, type))")
      .eq("slug", slug).maybeSingle();
    if (!text) return null;
    const songs = await fetchAllRows<{ id: string }>((f: number, t: number) => db.from("songs").select("id").eq("text_id", text.id).order("id").range(f, t));
    const tags = ((text.text_tags ?? []) as any[]).map((t) => t.tags).filter(Boolean) as LinkedTag[];
    const { origin, rest } = splitOrigin(tags);
    // "English" the culture already says "English" the language.
    const languages = rest.filter((t) => t.type === "language" && !origin.some((o) => o.name === t.name));
    const sources = sortSources((text.text_sources ?? []) as (SourceRef & { id: string })[]);
    const main = sources.find((r) => r.relation !== "inspired") ?? null;
    return {
      kind, name: text.title, subtitle: null,
      facts: [
        origin.map(tagFact),
        when(formatYear(text.year, text.year_precision)),
        main ? [sourceFact(main)] : [],
        writerFacts(text.text_credits ?? [], { author: "", translator: "trans. ", adapter: "adapted by " }),
        languages.map(tagFact),
      ].filter((g) => g.length),
      sources: sources.length > 1 || sources.some((r) => r.relation === "inspired")
        ? sources.map((r) => ({ ...sourceFact(r), text: capitalizeFirst(formatSourceRef(r)) }))
        : undefined,
      notes: text.notes ?? null, parents: [], children: [], related: rest.filter((t) => t.type !== "language"),
      songIds: songs.map((r) => r.id), roles: new Map(),
    };
  }
  if (kind === "scripture") {
    const [bookSlug, chapterPart] = slug.split("/");
    const book = scriptureBookFromSlug(bookSlug ?? "");
    const chapter = chapterPart ? Number(chapterPart) : null;
    if (!book || (chapterPart && !Number.isInteger(chapter))) return null;
    const refs = await fetchAllRows<SourceRef & { text_id: string; id: string }>((f: number, t: number) =>
      db.from("text_sources").select("id, text_id, corpus, book, chapter_start, verse_start, chapter_end, verse_end, relation").eq("book", book).order("id").range(f, t)
    );
    const inChapter = (r: SourceRef) => chapter == null || (r.chapter_start != null && r.chapter_start <= chapter && chapter <= (r.chapter_end ?? r.chapter_start));
    const here = refs.filter(inChapter);
    const textIds = [...new Set(here.map((r) => r.text_id))];
    const songs = textIds.length
      ? await fetchAllRows<{ id: string; text_id: string; tune_id: string | null }>((f: number, t: number) => db.from("songs").select("id, text_id, tune_id").in("text_id", textIds).order("id").range(f, t))
      : [];
    const refByText = new Map<string, SourceRef>();
    for (const r of sortSources(here)) if (!refByText.has(r.text_id)) refByText.set(r.text_id, r);
    // A song with no tune already shows its passage on its card (songCardIdentity).
    const roles = new Map(songs.filter((s) => s.tune_id || refByText.get(s.text_id)!.relation === "inspired")
      .map((s) => [s.id, capitalizeFirst(formatSourceRef(refByText.get(s.text_id)!))]));
    const chapters = [...new Set(refs.map((r) => r.chapter_start).filter((c): c is number => c != null))].sort((a, b) => a - b);
    const bookChip: LinkedTag = { name: book, slug: scriptureBookSlug(book), type: "scripture" };
    return {
      kind, slug, label: "Scripture",
      name: chapter ? formatScriptureRef({ book, chapter_start: chapter, verse_start: null }) : book,
      subtitle: TANAKH_BOOKS.includes(book) ? "Hebrew Bible" : NEW_TESTAMENT_BOOKS.includes(book) ? "New Testament" : null,
      readUrl: chapter ? scriptureReadUrl({ book, chapter_start: chapter, verse_start: null }) : null,
      notes: null,
      parents: chapter ? [bookChip] : [],
      children: chapter ? [] : chapters.map((c) => ({ name: formatScriptureRef({ book, chapter_start: c, verse_start: null }), slug: `${scriptureBookSlug(book)}/${c}`, type: "scripture" as const })),
      related: [], songIds: songs.map((s) => s.id), roles,
    };
  }

  // Tags open by slug, or by name (song cards link a culture by its name).
  const columns = "id, name, slug, type, description";
  let { data: tag } = await db.from("tags").select(columns).eq("type", kind).eq("slug", slug).maybeSingle();
  if (!tag) ({ data: tag } = await db.from("tags").select(columns).eq("type", kind).eq("name", slug).maybeSingle());
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
    kind, slug: tag.slug, name: tag.name, subtitle: null, notes: tag.description ?? null,
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

// The cultures among a page's songs, most songs first, each linking to that
// culture's traditional songs: the Traditional page's "By culture" row.
export function traditionalCultureChips(meta: { cultures: string[] }[]): BrowseChip[] {
  const counts = new Map<string, number>();
  for (const m of meta) for (const c of new Set(m.cultures)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => ({ label, count, href: browsePath("culture", label, { traditional: true }) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

const ORIGIN_TYPES = new Set(["culture", "community"]);
const when = (v: string | number | null | undefined): CardCredit[] => (v == null || v === "" ? [] : [{ text: String(v), link: null }]);
const tagFact = (t: LinkedTag): CardCredit => ({ text: t.name, link: { kind: t.type, key: t.slug } });

// Where a tune or text comes from leads its facts; other tags stay as chips.
function splitOrigin(tags: LinkedTag[]) {
  const sorted = [...tags].sort((a, b) => (a.name < b.name ? -1 : 1));
  return { origin: sorted.filter((t) => ORIGIN_TYPES.has(t.type)), rest: sorted.filter((t) => !ORIGIN_TYPES.has(t.type)) };
}

function sourceFact(r: SourceRef): CardCredit {
  const key = scriptureKey(r);
  return { text: formatSourceRef(r), link: key ? { kind: "scripture", key } : null };
}

// Writers by role, "Traditional" first: "Traditional, arr. Ralph Vaughan Williams".
function writerFacts(credits: any[], prefix: Record<string, string>): CardCredit[] {
  const order = Object.keys(prefix);
  const trad = (c: any) => (c.people.name.toLowerCase() === "traditional" ? 0 : 1);
  return [...credits]
    .filter((c) => c.people)
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || trad(a) - trad(b))
    .map((c): CardCredit => ({
      ...(prefix[c.role] ? { lead: prefix[c.role] } : {}),
      text: c.people.name,
      link: { kind: "person", key: c.people.slug ?? c.people.name },
    }));
}
