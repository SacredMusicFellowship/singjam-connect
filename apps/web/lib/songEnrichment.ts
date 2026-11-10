import type { SupabaseClient } from "@supabase/supabase-js";
import {
  withoutGenericFaithThemes,
  withoutMisfitForms,
  decideEnrichment,
  decideListedFacts,
  SONG_COMMUNITIES,
  SONG_CULTURES,
  SONG_FORMS,
  SONG_GENRES,
  SONG_METERS,
  SONG_OCCASIONS,
  SONG_THEMES,
  SONG_TONALITIES,
  type TagType,
  type EnrichmentDecision,
  type EnrichmentSources,
  reviewEnrichment,
  type ModelAnswer,
  type WikipediaFacts,
} from "@singjam/core";
import { askClaudeJson, askGptJson, type ModelUsage } from "@/lib/enrichmentModels";
import {
  extractWikipediaFacts, lookUpGenius, lookUpHymnary, lookUpLyrics, lookUpMusicBrainz, lookUpWikipedia, norm, searchFirstLine,
  type Field, type SongContext,
} from "@/lib/enrichmentSources";
import { addFirstRecordings, addLandmarkRecordings, type FirstRecordingResult, type LandmarkResult } from "@/lib/enrichmentRecordings";
import { idsFor, recordEnrichmentUsage, tagIds } from "@/lib/enrichmentDb";

// A song's automatic fill (enrichSong) and the editor's "Suggest improvements"
// review: gather every source, decide with the shared rules in core.
export type { ModelUsage } from "@/lib/enrichmentModels";
export { searchFirstLine, type SongContext } from "@/lib/enrichmentSources";
export { addFirstRecordings, addLandmarkRecordings, type FirstRecordingResult, type LandmarkResult } from "@/lib/enrichmentRecordings";
export { idsFor, recordEnrichmentUsage, tagIds } from "@/lib/enrichmentDb";

const FIELD_RULES: Record<Field, string> = {
  year_written: "year_written: year the song was composed (not recorded)",
  recording_year: "recording_year: year the named artist's recording was first released (original single or studio album, not a compilation, remaster or live album)",
  composers: 'composers: full canonical names of who wrote the music; ["Traditional"] for traditional songs',
  lyricists: "lyricists: who wrote the words (often the same people as the composers)",
  tonality: `tonality: one of ${SONG_TONALITIES.join(", ")}`,
  meter: `meter: time-signature numerator, one of ${SONG_METERS.join(", ")}`,
  vibe: 'vibe: "Banger" (upbeat, high energy) or "Ballad" (slow, tender)',
  genres: `genres: 1 to 3, each from: ${SONG_GENRES.join(", ")}`,
  themes: `themes: 1 to 3 lyrical themes, each from: ${SONG_THEMES.join(", ")}. A Bible story is not Mythology`,
  languages: "languages: languages it is sung in, plain English names",
  cultures: `cultures: where the song comes from (nationality, ethnicity or region), each from: ${SONG_CULTURES.join(", ")}. Never "British". Religious traditions go in communities. Name the song's own musical tradition, never the performers' ethnicity: a spiritual or a traditional blues is African American; a soul or hip-hop record by Black artists gets no culture for that reason alone`,
  forms: `forms: what kind of piece it is, only if it clearly is one, each from: ${SONG_FORMS.join(", ")}. Empty for an ordinary popular song`,
  occasions: `occasions: when it is traditionally sung, only if it is strongly tied to one, each from: ${SONG_OCCASIONS.join(", ")}. Empty if none`,
  communities: `communities: the religious tradition or community it belongs to, only if it clearly belongs to one, each from: ${SONG_COMMUNITIES.join(", ")}. Empty if none`,
  first_line: "first_line: the first sung line, verbatim, without section labels",
  hook: "hook: the most recognisable lyric phrase, usually from the chorus, verbatim and short",
  notes: "notes: a short factual paragraph on the song's origin and history that a musician would find useful (disputed credits, notable recordings; Roud or Child numbers for traditional songs). Null if nothing solid",
  productions: "productions: the film, musical or TV show the song was written for or first introduced in. Not productions that later used an existing song or recording. Empty if none",
  alternate_titles: "alternate_titles: other titles the song is commonly known by; empty if none",
  music_culture: `music_culture: for a traditional song, the tradition its melody comes from, one of: ${SONG_CULTURES.join(", ")}. Null otherwise`,
  lyric_culture: `lyric_culture: for a traditional song, the tradition its words come from, one of: ${SONG_CULTURES.join(", ")}. Null otherwise`,
};

const ALL_FIELDS = Object.keys(FIELD_RULES) as Field[];
const ARRAY_FIELDS = new Set<Field>(["composers", "lyricists", "genres", "themes", "languages", "cultures", "forms", "occasions", "communities", "productions", "alternate_titles"]);
const NUMBER_FIELDS = new Set<Field>(["year_written", "recording_year"]);

function prompt(song: SongContext) {
  const system = `You are a careful music researcher filling gaps in a song database. Accuracy matters more than coverage: a wrong value is far worse than a missing one.
Only use the listed values where a list is given. For each field give confidence "high", "medium" or "low", and use null for the value when you don't know. Never guess facts or reconstruct lyrics you are unsure of.`;
  const known = [
    song.writers?.length ? `Written by: ${song.writers.join(", ")}` : null,
    song.firstLine ? `First line: "${song.firstLine}"` : null,
  ].filter(Boolean).join("\n");
  const user = `Song: "${song.title}" — ${song.artist ?? "(no artist)"}${song.production ? ` — from ${song.production}` : ""}${known ? `\n${known}\nAnswer about this song, not another song with the same title.` : ""}
Fill these fields:
${song.wanted.map((f) => `- ${FIELD_RULES[f]}`).join("\n")}
Return JSON: {"fields": {"<field>": {"v": <value or null>, "c": "high" | "medium" | "low"}}}. Where null isn't allowed, use "", 0 or [] for unknown.`;
  return { system, user };
}

function schemaFor(wanted: Field[]) {
  // No nullable types: Claude's structured output allows at most 16 union-typed
  // parameters and a review asks about more fields than that. "Unknown" comes
  // back as "", 0 or [] instead, and blankToNull turns it back into null.
  const valueType = (f: Field) =>
    ARRAY_FIELDS.has(f) ? { type: "array", items: { type: "string" } } : NUMBER_FIELDS.has(f) ? { type: "integer" } : { type: "string" };
  return {
    type: "object",
    additionalProperties: false,
    required: ["fields"],
    properties: {
      fields: {
        type: "object",
        additionalProperties: false,
        required: wanted,
        properties: Object.fromEntries(
          wanted.map((f) => [
            f,
            {
              type: "object",
              additionalProperties: false,
              required: ["v", "c"],
              properties: { v: valueType(f), c: { type: "string", enum: ["high", "medium", "low"] } },
            },
          ])
        ),
      },
    },
  };
}

const askGpt = (song: SongContext, usage: ModelUsage[]) => askGptJson<ModelAnswer>(prompt(song), "fields", "fill", usage);

function blankToNull(answer: ModelAnswer | null): ModelAnswer | null {
  if (!answer) return null;
  const out: Record<string, unknown> = {};
  for (const [field, a] of Object.entries(answer) as [string, { v: unknown; c: string } | null][])
    out[field] = a && (a.v === "" || a.v === 0 || (Array.isArray(a.v) && !a.v.length)) ? { ...a, v: null } : a;
  return out as ModelAnswer;
}

const askClaude = async (song: SongContext, usage: ModelUsage[]) =>
  blankToNull(await askClaudeJson<ModelAnswer>(prompt(song), schemaFor(song.wanted), "fields", 16000, "fill", usage));

// ---- Gathering every source, the one way all enrichment does it ----

export type SourceCheck = { name: string; ok: boolean };

// Each source gets a deadline; one that errors or runs over counts as having no
// answer, so a slow or broken source can never stall or fail a run.
async function timed<T>(name: string, ms: number, checks: SourceCheck[], work: () => Promise<T | null>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      console.error(`[song-enrichment] ${name} timed out after ${ms}ms`);
      resolve(null);
    }, ms);
  });
  const result = await Promise.race([
    work().catch((e) => {
      console.error(`[song-enrichment] ${name} failed:`, e instanceof Error ? e.message : e);
      return null;
    }),
    timeout,
  ]);
  clearTimeout(timer);
  checks.push({ name, ok: result !== null });
  return result;
}

export type GatheredSources = {
  sources: EnrichmentSources;
  wikipedia: (WikipediaFacts & { title: string; url: string }) | null;
  geniusUrl: string | null;
  checks: SourceCheck[];
  usage: ModelUsage[];
};

// Asks each source only when a wanted field needs it. Both the automatic fill
// and the editor's review go through here.
export async function gatherSources(
  song: SongContext,
  opts: { spotifyReleaseYear?: number | null; links?: boolean } = {},
): Promise<GatheredSources> {
  const { title, artist, wanted } = song;
  const usage: ModelUsage[] = [];
  const checks: SourceCheck[] = [];
  const wants = (...f: Field[]) => f.some((x) => wanted.includes(x));
  const [gpt, claude, musicbrainz, lyrics, wikipedia, geniusUrl, hymnary] = await Promise.all([
    timed("GPT", 150_000, checks, () => askGpt(song, usage)),
    timed("Claude", 150_000, checks, () => askClaude(song, usage)),
    artist && wants("recording_year", "composers") ? timed("MusicBrainz", 60_000, checks, () => lookUpMusicBrainz(title, artist)) : null,
    artist && wants("first_line", "hook") ? timed("LRCLIB", 20_000, checks, () => lookUpLyrics(title, artist)) : null,
    wants("notes", "productions", "alternate_titles")
      ? timed("Wikipedia", 90_000, checks, async () => {
          const page = await lookUpWikipedia(title, artist);
          const facts = page && (await extractWikipediaFacts(title, page.extract, usage));
          return page && facts ? { ...facts, title: page.title, url: page.url } : null;
        })
      : null,
    opts.links ? timed("Genius", 20_000, checks, () => lookUpGenius(title, song.artists ?? (artist ? [artist] : []))) : null,
    wants("first_line", "composers") ? timed("Hymnary", 60_000, checks, () => lookUpHymnary(title)) : null,
  ]);
  const order = ["GPT", "Claude", "MusicBrainz", "LRCLIB", "Hymnary", "Wikipedia", "Genius"];
  return {
    sources: { gpt, claude, musicbrainz, spotifyReleaseYear: opts.spotifyReleaseYear ?? null, lyrics, artist, writers: song.writers ?? [], hymnary, title },
    wikipedia,
    geniusUrl,
    checks: checks.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name)),
    usage,
  };
}

// Gathers every source for one song, decides with the shared rules, and fills
// only fields that are still empty — nothing someone has set is overwritten.
// searchFirstLine is off unless asked for: at ~13¢ a song it runs as a separate
// pass over songs still missing a first line, not on every add.
export async function enrichSong(
  admin: SupabaseClient,
  songId: string,
  opts: { spotifyReleaseYear?: number | null; dryRun?: boolean; searchFirstLine?: boolean } = {},
) {
  const { data: song, error } = await admin
    .from("songs")
    .select(
      "id, title, display_artist, year_written, tonality, meter, vibe, first_line, hook, song_composers(people(name)), song_lyricists(people(name)), song_tags(context, tags(type, name)), song_productions(productions(name)), song_alternate_titles(count), song_recording_artists(artist_id, year, position, artists(name))"
    )
    .eq("id", songId)
    .single();
  if (error || !song) throw error ?? new Error(`song ${songId} not found`);

  const s = song as any;
  const primary = [...(s.song_recording_artists ?? [])].sort((a: any, b: any) => (a.position ?? 99) - (b.position ?? 99))[0];
  const artist: string | null = primary?.artists?.name ?? s.display_artist ?? null;
  const empty = (n: { count: number }[]) => !n?.[0]?.count;
  const writers = [...(s.song_composers ?? []), ...(s.song_lyricists ?? [])]
    .map((r: any) => r.people?.name as string | undefined)
    .filter((n, i, all): n is string => !!n && all.indexOf(n) === i);
  const wanted: Field[] = [];
  if (!s.year_written) wanted.push("year_written");
  if (primary && !primary.year) wanted.push("recording_year");
  if (!writers.length) wanted.push("composers", "lyricists");
  if (!s.tonality) wanted.push("tonality");
  if (!s.meter) wanted.push("meter");
  if (!s.vibe) wanted.push("vibe");
  const hasTag = (type: TagType) => (s.song_tags ?? []).some((t: any) => t.tags?.type === type && t.context === "general");
  if (!hasTag("genre")) wanted.push("genres");
  if (!hasTag("theme")) wanted.push("themes");
  if (!hasTag("language")) wanted.push("languages");
  if (!hasTag("culture")) wanted.push("cultures");
  if (!hasTag("form")) wanted.push("forms");
  if (!hasTag("occasion")) wanted.push("occasions");
  if (!hasTag("community")) wanted.push("communities");
  if (!s.first_line) wanted.push("first_line");
  if (!s.hook) wanted.push("hook");
  if (!(s.song_productions ?? []).length) wanted.push("productions");
  if (empty(s.song_alternate_titles)) wanted.push("alternate_titles");
  if (!wanted.length) return { songId, decision: {} as EnrichmentDecision, usage: [] as ModelUsage[] };

  if (!opts.dryRun) await admin.from("songs").update({ enrichment_started_at: new Date().toISOString() }).eq("id", songId);
  try {
    const filled = await fillSong(admin, songId, s, primary, artist, writers, wanted, opts);
    // A song with a recording gets its iconic others; one without gets the
    // recordings people know it from.
    const [landmarks, first] = primary
      ? [await addLandmarkRecordings(admin, songId, opts).catch((e) => {
          console.error("[song-enrichment] landmark recordings failed:", e instanceof Error ? e.message : e);
          return { added: [] as LandmarkResult[], usage: [] as ModelUsage[] };
        }), { added: [] as FirstRecordingResult[], usage: [] as ModelUsage[] }]
      : [{ added: [] as LandmarkResult[], usage: [] as ModelUsage[] }, await addFirstRecordings(admin, songId, opts).catch((e) => {
          console.error("[song-enrichment] first recordings failed:", e instanceof Error ? e.message : e);
          return { added: [] as FirstRecordingResult[], usage: [] as ModelUsage[] };
        })];
    const usage = [...filled.usage, ...landmarks.usage, ...first.usage];
    if (!opts.dryRun) await recordEnrichmentUsage(admin, songId, "fill", usage);
    return { ...filled, usage, landmarks: landmarks.added, firstRecordings: first.added };
  } finally {
    if (!opts.dryRun) await admin.from("songs").update({ enrichment_finished_at: new Date().toISOString() }).eq("id", songId);
  }
}

async function fillSong(
  admin: SupabaseClient,
  songId: string,
  s: any,
  primary: any,
  artist: string | null,
  writers: string[],
  wanted: Field[],
  opts: { spotifyReleaseYear?: number | null; dryRun?: boolean; searchFirstLine?: boolean },
) {
  const context: SongContext = {
    title: s.title,
    artist,
    production: (s.song_productions ?? []).map((p: any) => p.productions?.name).filter(Boolean).join(", ") || null,
    wanted,
    writers,
    firstLine: s.first_line ?? null,
  };
  const { sources, wikipedia, checks, usage } = await gatherSources(context, { spotifyReleaseYear: opts.spotifyReleaseYear });
  const decision = { ...decideEnrichment(sources), ...decideListedFacts(sources, wikipedia) };
  let firstLineSource: string | null = null;
  if (opts.searchFirstLine && wanted.includes("first_line") && !decision.first_line) {
    const found = await timed("Web search", 180_000, checks, () => searchFirstLine(context, usage));
    if (found) {
      decision.first_line = found.first_line;
      firstLineSource = found.url;
    }
  }
  if (decision.forms)
    decision.forms = withoutMisfitForms(decision.forms, [
      ...(s.song_tags ?? []).filter((t: any) => t.tags?.type === "genre").map((t: any) => t.tags.name as string),
      ...(wanted.includes("genres") ? decision.genres ?? [] : []),
    ]);
  if (opts.dryRun) return { songId, decision, usage, checks, firstLineSource };

  const scalar: Record<string, unknown> = {};
  for (const f of ["year_written", "tonality", "meter", "vibe", "first_line", "hook"] as const)
    if (decision[f] !== undefined && wanted.includes(f)) scalar[f] = decision[f];
  if (Object.keys(scalar).length) await admin.from("songs").update({ ...scalar, updated_at: new Date().toISOString() }).eq("id", songId);

  if (decision.recording_year && primary && !primary.year)
    await admin.from("song_recording_artists").update({ year: decision.recording_year }).eq("song_id", songId).eq("artist_id", primary.artist_id);

  if ((decision.composers || decision.lyricists) && wanted.includes("composers")) {
    const c = decision.composers ? await idsFor(admin, "people", decision.composers) : [];
    const l = decision.lyricists ? await idsFor(admin, "people", decision.lyricists) : [];
    if (c.length) await admin.from("song_composers").insert(c.map((person_id) => ({ song_id: songId, person_id })));
    if (l.length) await admin.from("song_lyricists").insert(l.map((person_id) => ({ song_id: songId, person_id })));
  }
  const tagFields = [["genres", "genre"], ["themes", "theme"], ["cultures", "culture"], ["languages", "language"],
    ["forms", "form"], ["occasions", "occasion"], ["communities", "community"]] as const;
  // Faith/Spirituality add nothing to a song already known as religious.
  const existing = (type: string) => (s.song_tags ?? []).filter((t: any) => t.tags?.type === type).map((t: any) => t.tags.name as string);
  const religion = {
    communities: [...existing("community"), ...(wanted.includes("communities") ? decision.communities ?? [] : [])],
    forms: [...existing("form"), ...(wanted.includes("forms") ? decision.forms ?? [] : [])],
    genres: [...existing("genre"), ...(wanted.includes("genres") ? decision.genres ?? [] : [])],
  };
  if (decision.themes) decision.themes = withoutGenericFaithThemes(decision.themes, religion);
  for (const [field, type] of tagFields) {
    const names = decision[field];
    if (!names?.length || !wanted.includes(field)) continue;
    const ids = await tagIds(admin, type, names);
    if (ids.length) await admin.from("song_tags").upsert(ids.map((tag_id) => ({ song_id: songId, tag_id, context: "general" })), { ignoreDuplicates: true });
  }
  if (decision.productions && wanted.includes("productions")) {
    for (const name of decision.productions) {
      const { data: found } = await admin.from("productions").select("id").ilike("name", name).limit(1).maybeSingle();
      const id = found?.id ?? (await admin.from("productions").insert({ name, year: null }).select("id").single()).data?.id;
      if (id) await admin.from("song_productions").insert({ song_id: songId, production_id: id });
    }
  }
  if (decision.alternate_titles && wanted.includes("alternate_titles")) {
    const titles = decision.alternate_titles.filter((t, i, all) => norm(t) !== norm(s.title) && all.findIndex((x) => norm(x) === norm(t)) === i);
    if (titles.length) await admin.from("song_alternate_titles").insert(titles.map((title) => ({ song_id: songId, title })));
  }
  return { songId, decision, usage, firstLineSource };
}

// Review mode for the song editor: asks every source about every field, saves
// nothing, and returns suggestions a person ticks before they're applied.
export async function proposeEnrichment(admin: SupabaseClient, songId: string) {
  const { data: song, error } = await admin
    .from("songs")
    .select("title, display_artist, song_alternate_titles(title), song_productions(productions(name)), song_recording_artists(position, artists(name))")
    .eq("id", songId)
    .single();
  if (error || !song) throw error ?? new Error(`song ${songId} not found`);

  const s = song as any;
  const primary = [...(s.song_recording_artists ?? [])].sort((a: any, b: any) => (a.position ?? 99) - (b.position ?? 99))[0];
  const context: SongContext = {
    title: s.title,
    artist: primary?.artists?.name ?? s.display_artist ?? null,
    artists: [...(s.song_recording_artists ?? [])]
      .sort((a: any, b: any) => (a.position ?? 99) - (b.position ?? 99))
      .map((r: any) => r.artists?.name)
      .filter(Boolean),
    production: (s.song_productions ?? []).map((p: any) => p.productions?.name).filter(Boolean).join(", ") || null,
    wanted: ALL_FIELDS,
  };
  const [gathered, landmarks] = await Promise.all([
    gatherSources(context, { links: true }),
    addLandmarkRecordings(admin, songId, { dryRun: true }).catch(() => ({ added: [] as LandmarkResult[], usage: [] as ModelUsage[] })),
  ]);
  const review = reviewEnrichment(gathered.sources, landmarks.added, { wikipedia: gathered.wikipedia, geniusUrl: gathered.geniusUrl });
  const existingTitles = new Set([s.title, ...(s.song_alternate_titles ?? []).map((t: any) => t.title)].map(norm));
  review.suggestions.alternate_titles = review.suggestions.alternate_titles.filter((t) => !existingTitles.has(norm(t)));
  return {
    ...review,
    checks: gathered.checks,
    wikipedia: gathered.wikipedia ? { title: gathered.wikipedia.title, url: gathered.wikipedia.url } : null,
    usage: [...gathered.usage, ...landmarks.usage],
  };
}

// Runs a review and stores it on the song for the editor to pick up. The
// requested-at stamp lets the editor ignore an older run that finishes late.
export async function runEnrichmentReview(admin: SupabaseClient, songId: string, requestedAt: string) {
  let proposal: Record<string, unknown>;
  try {
    const { usage, ...review } = await proposeEnrichment(admin, songId);
    console.log(`[enrich-review] ${songId}: usage ${JSON.stringify(usage)}`);
    await recordEnrichmentUsage(admin, songId, "review", usage);
    proposal = { requested_at: requestedAt, finished_at: new Date().toISOString(), ...review };
  } catch (e) {
    console.error(`[enrich-review] ${songId} failed: ${e instanceof Error ? e.message : String(e)}`);
    proposal = { requested_at: requestedAt, finished_at: new Date().toISOString(), error: true };
  }
  await admin.from("songs").update({ enrichment_proposal: proposal }).eq("id", songId).eq("enrichment_proposal->>requested_at", requestedAt);
}
