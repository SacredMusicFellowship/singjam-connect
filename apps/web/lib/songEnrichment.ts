import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  agreedLandmarks,
  decideEnrichment,
  landmarkYear,
  leadArtist,
  MAX_RECORDINGS,
  sameArtist,
  SONG_CULTURES,
  SONG_GENRES,
  SONG_METERS,
  SONG_THEMES,
  SONG_TONALITIES,
  type EnrichmentDecision,
  type EnrichmentSources,
  reviewEnrichment,
  type EnrichmentReview,
  type LandmarkCandidate,
  type ModelAnswer,
} from "@singjam/core";

const USER_AGENT = "SingJam/1.0 ( https://singjam.org )";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

type Field = keyof ModelAnswer;
export type ModelUsage = { model: string; input: number; output: number; reasoning?: number };
type SongContext = { title: string; artist: string | null; production: string | null; wanted: Field[] };

const FIELD_RULES: Record<Field, string> = {
  year_written: "year_written: year the song was composed (not recorded)",
  recording_year: "recording_year: year the named artist's recording was first released (original single or studio album, not a compilation, remaster or live album)",
  composers: 'composers: full canonical names of who wrote the music; ["Traditional"] for traditional songs',
  lyricists: "lyricists: who wrote the words (often the same people as the composers)",
  tonality: `tonality: one of ${SONG_TONALITIES.join(", ")}`,
  meter: `meter: time-signature numerator, one of ${SONG_METERS.join(", ")}`,
  vibe: 'vibe: "Banger" (upbeat, high energy) or "Ballad" (slow, tender)',
  genres: `genres: 1 to 3, each from: ${SONG_GENRES.join(", ")}`,
  themes: `themes: 1 to 3 lyrical themes, each from: ${SONG_THEMES.join(", ")}`,
  languages: "languages: languages it is sung in, plain English names",
  cultures: `cultures: cultural origins or associations, each from: ${SONG_CULTURES.join(", ")}. Never "British"`,
  first_line: "first_line: the first sung line, verbatim, without section labels",
  hook: "hook: the most recognisable lyric phrase, usually from the chorus, verbatim and short",
  notes: "notes: a short factual paragraph on the song's origin and history that a musician would find useful (disputed credits, notable recordings; Roud or Child numbers for traditional songs). Null if nothing solid",
  productions: "productions: films, musicals or TV shows the song first appeared in or is strongly tied to; empty if none",
  alternate_titles: "alternate_titles: other titles the song is commonly known by; empty if none",
  music_culture: `music_culture: for a traditional song, the tradition its melody comes from, one of: ${SONG_CULTURES.join(", ")}. Null otherwise`,
  lyric_culture: `lyric_culture: for a traditional song, the tradition its words come from, one of: ${SONG_CULTURES.join(", ")}. Null otherwise`,
};

const ALL_FIELDS = Object.keys(FIELD_RULES) as Field[];
const ARRAY_FIELDS = new Set<Field>(["composers", "lyricists", "genres", "themes", "languages", "cultures", "productions", "alternate_titles"]);
const NUMBER_FIELDS = new Set<Field>(["year_written", "recording_year"]);

function prompt(song: SongContext) {
  const system = `You are a careful music researcher filling gaps in a song database. Accuracy matters more than coverage: a wrong value is far worse than a missing one.
Only use the listed values where a list is given. For each field give confidence "high", "medium" or "low", and use null for the value when you don't know. Never guess facts or reconstruct lyrics you are unsure of.`;
  const user = `Song: "${song.title}" — ${song.artist ?? "(no artist)"}${song.production ? ` — from ${song.production}` : ""}
Fill these fields:
${song.wanted.map((f) => `- ${FIELD_RULES[f]}`).join("\n")}
Return JSON: {"fields": {"<field>": {"v": <value or null>, "c": "high" | "medium" | "low"}}}`;
  return { system, user };
}

function schemaFor(wanted: Field[]) {
  const valueType = (f: Field) =>
    ARRAY_FIELDS.has(f) ? { type: ["array", "null"], items: { type: "string" } } : NUMBER_FIELDS.has(f) ? { type: ["integer", "null"] } : { type: ["string", "null"] };
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

async function askGpt(song: SongContext, usage: ModelUsage[]): Promise<ModelAnswer | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const { system, user } = prompt(song);
    const res = await new OpenAI().chat.completions.create({
      model: "gpt-5.5",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    usage.push({
      model: res.model,
      input: res.usage?.prompt_tokens ?? 0,
      output: res.usage?.completion_tokens ?? 0,
      reasoning: res.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    });
    return JSON.parse(res.choices[0].message.content ?? "{}").fields ?? null;
  } catch (e) {
    console.error("[song-enrichment] gpt failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function askClaude(song: SongContext, usage: ModelUsage[]): Promise<ModelAnswer | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { system, user } = prompt(song);
    const res = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: schemaFor(song.wanted) } },
      system,
      messages: [{ role: "user", content: user }],
    });
    usage.push({ model: res.model, input: res.usage.input_tokens, output: res.usage.output_tokens });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? JSON.parse(text.text).fields ?? null : null;
  } catch (e) {
    console.error("[song-enrichment] claude failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function musicbrainz(path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { "User-Agent": USER_AGENT } });
    await sleep(1100);
    if (res.status === 503 || res.status === 429) continue;
    return res.ok ? res.json() : null;
  }
  return null;
}

// Earliest release among the artist's own albums, singles and EPs — compilations,
// live albums and soundtracks carry reissue dates and are skipped.
async function lookUpMusicBrainz(title: string, artist: string) {
  const q = `recording:"${title.replace(/"/g, "")}" AND artist:"${artist.replace(/"/g, "")}"`;
  const json = await musicbrainz(`recording?fmt=json&limit=100&query=${encodeURIComponent(q)}`);
  const recordings = ((json?.recordings ?? []) as any[]).filter(
    (r) =>
      norm(r.title) === norm(title) &&
      norm((r["artist-credit"] ?? []).map((c: any) => c.name + (c.joinphrase ?? "")).join("")).includes(norm(artist)) &&
      !/\b(live|demo|remix|instrumental|karaoke)\b/i.test(`${r.disambiguation ?? ""} ${r.title}`)
  );
  const years: number[] = [];
  for (const r of recordings)
    for (const rel of r.releases ?? []) {
      const rg = rel["release-group"] ?? {};
      const y = parseInt((rel.date ?? "").slice(0, 4));
      if (["Album", "Single", "EP"].includes(rg["primary-type"]) && !(rg["secondary-types"] ?? []).length && y >= 1890) years.push(y);
    }

  const composers = new Set<string>(), lyricists = new Set<string>();
  for (const r of recordings.slice(0, 3)) {
    const withWorks = await musicbrainz(`recording/${r.id}?fmt=json&inc=work-rels`);
    const work = (withWorks?.relations ?? []).find((rel: any) => rel.work && norm(rel.work.title) === norm(title))?.work;
    if (!work) continue;
    const credits = await musicbrainz(`work/${work.id}?fmt=json&inc=artist-rels`);
    for (const rel of credits?.relations ?? []) {
      if (!rel.artist) continue;
      if (rel.type === "composer" || rel.type === "writer") composers.add(rel.artist.name);
      if (rel.type === "lyricist" || rel.type === "writer") lyricists.add(rel.artist.name);
    }
    break;
  }
  return { recordingYear: years.length ? Math.min(...years) : null, composers: [...composers], lyricists: [...lyricists] };
}

async function lookUpLyrics(title: string, artist: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
      { headers: { "User-Agent": USER_AGENT } }
    );
    if (!res.ok) return null;
    const hit = ((await res.json()) as any[]).find(
      (x) => x.plainLyrics && !x.instrumental && norm(x.trackName) === norm(title) && norm(x.artistName) === norm(artist)
    );
    return hit?.plainLyrics ?? null;
  } catch {
    return null;
  }
}

// ---- Other recordings worth listing (landmarkRecordings in core decides) ----

const LANDMARK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recordings"],
  properties: {
    recordings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["artist", "year", "why"],
        properties: { artist: { type: "string" }, year: { type: "integer" }, why: { type: "string", enum: ["original", "iconic"] } },
      },
    },
  },
};

function landmarkPrompt(title: string, artists: string[]) {
  const system = "You are a careful music researcher. Accuracy matters more than coverage: a wrong recording is far worse than a missing one.";
  const user = `Song: "${title}". The database already has recordings by: ${artists.join(", ")}.
List OTHER recordings only if they are iconic: a version many people would name as THE version of this song, or a No. 1 hit or million-selling signature recording in its own era that is still remembered as such. The original recording counts only when it passes the same test.
Never list: artists already in the database (under any name they have recorded as), chart hits that are no longer remembered, talent-show or charity singles, novelty or parody covers, live recordings, or covers that are acclaimed but not widely known.
Most songs have exactly one iconic recording, so an empty list is the expected answer for most songs. At most 3. Use the artist's credited name and the year that recording was first released.
Return JSON: {"recordings": [{"artist", "year", "why"}]} where why is "original" or "iconic".`;
  return { system, user };
}

async function askGptLandmarks(title: string, artists: string[], usage: ModelUsage[]): Promise<LandmarkCandidate[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const { system, user } = landmarkPrompt(title, artists);
    const res = await new OpenAI().chat.completions.create({
      model: "gpt-5.5",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });
    usage.push({ model: res.model, input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0, reasoning: res.usage?.completion_tokens_details?.reasoning_tokens ?? 0 });
    return JSON.parse(res.choices[0].message.content ?? "{}").recordings ?? null;
  } catch (e) {
    console.error("[song-enrichment] gpt landmarks failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function askClaudeLandmarks(title: string, artists: string[], usage: ModelUsage[]): Promise<LandmarkCandidate[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { system, user } = landmarkPrompt(title, artists);
    const res = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: LANDMARK_SCHEMA } },
      system,
      messages: [{ role: "user", content: user }],
    });
    usage.push({ model: res.model, input: res.usage.input_tokens, output: res.usage.output_tokens });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b) => b.type === "text");
    return text && text.type === "text" ? JSON.parse(text.text).recordings ?? null : null;
  } catch (e) {
    console.error("[song-enrichment] claude landmarks failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// Does MusicBrainz have this artist's studio recording of the song? Returns the
// credit naming the same act (else the name the models used) and the earliest
// dated album/single/EP year.
async function musicBrainzRecording(title: string, artist: string) {
  const lead = leadArtist(artist);
  const q = `recording:"${title.replace(/"/g, "")}" AND artist:"${lead.replace(/"/g, "")}"`;
  const json = await musicbrainz(`recording?fmt=json&limit=100&query=${encodeURIComponent(q)}`);
  let found = false;
  let credit: string | null = null;
  const years: number[] = [];
  for (const r of (json?.recordings ?? []) as any[]) {
    const name = (r["artist-credit"] ?? []).map((c: any) => c.name + (c.joinphrase ?? "")).join("");
    if (norm(r.title) !== norm(title) || !norm(name).includes(norm(lead))) continue;
    if (/\b(live|demo|remix|instrumental|karaoke)\b/i.test(`${r.disambiguation ?? ""} ${r.title}`)) continue;
    found = true;
    if (!credit && sameArtist(name, artist)) credit = name;
    for (const rel of r.releases ?? []) {
      const rg = rel["release-group"] ?? {};
      const y = parseInt((rel.date ?? "").slice(0, 4));
      if (["Album", "Single", "EP"].includes(rg["primary-type"]) && !(rg["secondary-types"] ?? []).length && y >= 1890) years.push(y);
    }
  }
  return found ? { credit: credit ?? artist, year: years.length ? Math.min(...years) : null } : null;
}

export type LandmarkResult = { artist: string; year: number | null };

// Adds the iconic other recordings of a song: both models must name the artist,
// and MusicBrainz must have the recording. Most songs get none.
export async function addLandmarkRecordings(admin: SupabaseClient, songId: string, opts: { dryRun?: boolean } = {}) {
  const usage: ModelUsage[] = [];
  const { data: song } = await admin
    .from("songs")
    .select("title, song_recording_artists(position, artists(name))")
    .eq("id", songId)
    .single();
  const existing = ((song as any)?.song_recording_artists ?? []).map((r: any) => r.artists?.name).filter(Boolean) as string[];
  if (!song || !existing.length || existing.length >= MAX_RECORDINGS) return { added: [] as LandmarkResult[], usage };

  const [gpt, claude] = await Promise.all([askGptLandmarks(song.title, existing, usage), askClaudeLandmarks(song.title, existing, usage)]);
  const added: LandmarkResult[] = [];
  let position = Math.max(...((song as any).song_recording_artists ?? []).map((r: any) => r.position ?? 0)) + 1;
  for (const pick of agreedLandmarks(gpt, claude, existing)) {
    const found = await musicBrainzRecording(song.title, pick.artist.length >= pick.altArtist.length ? pick.artist : pick.altArtist);
    if (!found) continue;
    const year = landmarkYear(pick.gptYear, pick.claudeYear, found.year);
    added.push({ artist: found.credit, year });
    if (opts.dryRun) continue;
    const [artistId] = await idsFor(admin, "artists", [found.credit]);
    if (!artistId) continue;
    await admin.from("song_recording_artists").insert({ song_id: songId, artist_id: artistId, year, position: position++ });
  }
  return { added, usage };
}

async function idsFor(admin: SupabaseClient, table: "people" | "languages" | "artists", names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const { data: found } = await admin.from(table).select("id").ilike("name", name).limit(1).maybeSingle();
    const id = found?.id ?? (await admin.from(table).insert({ name }).select("id").single()).data?.id;
    if (id) ids.push(id);
  }
  return ids;
}

async function lookupIds(admin: SupabaseClient, table: "genres" | "themes" | "cultures", names: string[]) {
  const { data } = await admin.from(table).select("id, name").in("name", names);
  return (data ?? []).map((r) => r.id as string);
}

// Gathers every source for one song, decides with the shared rules, and fills
// only fields that are still empty — nothing someone has set is overwritten.
export async function enrichSong(admin: SupabaseClient, songId: string, opts: { spotifyReleaseYear?: number | null; dryRun?: boolean } = {}) {
  const { data: song, error } = await admin
    .from("songs")
    .select(
      "id, title, display_artist, year_written, tonality, meter, vibe, first_line, hook, song_composers(count), song_lyricists(count), song_genres(count), song_themes(count), song_languages(count), song_cultures(context), song_productions(productions(name)), song_recording_artists(artist_id, year, position, artists(name))"
    )
    .eq("id", songId)
    .single();
  if (error || !song) throw error ?? new Error(`song ${songId} not found`);

  const s = song as any;
  const primary = [...(s.song_recording_artists ?? [])].sort((a: any, b: any) => (a.position ?? 99) - (b.position ?? 99))[0];
  const artist: string | null = primary?.artists?.name ?? s.display_artist ?? null;
  const empty = (n: { count: number }[]) => !n?.[0]?.count;
  const wanted: Field[] = [];
  if (!s.year_written) wanted.push("year_written");
  if (primary && !primary.year) wanted.push("recording_year");
  if (empty(s.song_composers) && empty(s.song_lyricists)) wanted.push("composers", "lyricists");
  if (!s.tonality) wanted.push("tonality");
  if (!s.meter) wanted.push("meter");
  if (!s.vibe) wanted.push("vibe");
  if (empty(s.song_genres)) wanted.push("genres");
  if (empty(s.song_themes)) wanted.push("themes");
  if (empty(s.song_languages)) wanted.push("languages");
  if (!(s.song_cultures ?? []).some((c: any) => !c.context)) wanted.push("cultures");
  if (!s.first_line) wanted.push("first_line");
  if (!s.hook) wanted.push("hook");
  if (!wanted.length) return { songId, decision: {} as EnrichmentDecision, usage: [] as ModelUsage[] };

  if (!opts.dryRun) await admin.from("songs").update({ enrichment_started_at: new Date().toISOString() }).eq("id", songId);
  try {
    const filled = await fillSong(admin, songId, s, primary, artist, wanted, opts);
    const landmarks = await addLandmarkRecordings(admin, songId, opts).catch((e) => {
      console.error("[song-enrichment] landmark recordings failed:", e instanceof Error ? e.message : e);
      return { added: [] as LandmarkResult[], usage: [] as ModelUsage[] };
    });
    return { ...filled, usage: [...filled.usage, ...landmarks.usage], landmarks: landmarks.added };
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
  wanted: Field[],
  opts: { spotifyReleaseYear?: number | null; dryRun?: boolean },
) {
  const context: SongContext = {
    title: s.title,
    artist,
    production: (s.song_productions ?? []).map((p: any) => p.productions?.name).filter(Boolean).join(", ") || null,
    wanted,
  };
  const needsMb = artist && (wanted.includes("recording_year") || wanted.includes("composers"));
  const needsLyrics = artist && (wanted.includes("first_line") || wanted.includes("hook"));
  const usage: ModelUsage[] = [];
  const [gpt, claude, mb, lyrics] = await Promise.all([
    askGpt(context, usage),
    askClaude(context, usage),
    needsMb ? lookUpMusicBrainz(s.title, artist!) : Promise.resolve(null),
    needsLyrics ? lookUpLyrics(s.title, artist!) : Promise.resolve(null),
  ]);
  const sources: EnrichmentSources = { gpt, claude, musicbrainz: mb, spotifyReleaseYear: opts.spotifyReleaseYear ?? null, lyrics };
  const decision = decideEnrichment(sources);
  if (opts.dryRun) return { songId, decision, usage, sources: { gpt: !!gpt, claude: !!claude, musicbrainz: !!mb, lyrics: !!lyrics } };

  const scalar: Record<string, unknown> = {};
  for (const f of ["year_written", "tonality", "meter", "vibe", "first_line", "hook"] as const)
    if (decision[f] !== undefined && wanted.includes(f)) scalar[f] = decision[f];
  if (Object.keys(scalar).length) await admin.from("songs").update({ ...scalar, updated_at: new Date().toISOString() }).eq("id", songId);

  if (decision.recording_year && primary && !primary.year)
    await admin.from("song_recording_artists").update({ year: decision.recording_year }).eq("song_id", songId).eq("artist_id", primary.artist_id);

  if (decision.composers && wanted.includes("composers")) {
    const c = await idsFor(admin, "people", decision.composers);
    const l = await idsFor(admin, "people", decision.lyricists ?? decision.composers);
    if (c.length) await admin.from("song_composers").insert(c.map((person_id) => ({ song_id: songId, person_id })));
    if (l.length) await admin.from("song_lyricists").insert(l.map((person_id) => ({ song_id: songId, person_id })));
  }
  if (decision.genres && wanted.includes("genres")) {
    const ids = await lookupIds(admin, "genres", decision.genres);
    if (ids.length) await admin.from("song_genres").insert(ids.map((genre_id) => ({ song_id: songId, genre_id })));
  }
  if (decision.themes && wanted.includes("themes")) {
    const ids = await lookupIds(admin, "themes", decision.themes);
    if (ids.length) await admin.from("song_themes").insert(ids.map((theme_id) => ({ song_id: songId, theme_id })));
  }
  if (decision.cultures && wanted.includes("cultures")) {
    const ids = await lookupIds(admin, "cultures", decision.cultures);
    if (ids.length) await admin.from("song_cultures").insert(ids.map((culture_id) => ({ song_id: songId, culture_id })));
  }
  if (decision.languages && wanted.includes("languages")) {
    const ids = await idsFor(admin, "languages", decision.languages);
    if (ids.length) await admin.from("song_languages").insert(ids.map((language_id) => ({ song_id: songId, language_id })));
  }
  return { songId, decision, usage };
}

// Review mode for the song editor: asks every source about every field, saves
// nothing, and returns suggestions a person ticks before they're applied.
export async function proposeEnrichment(admin: SupabaseClient, songId: string): Promise<EnrichmentReview & { usage: ModelUsage[] }> {
  const { data: song, error } = await admin
    .from("songs")
    .select("title, display_artist, song_alternate_titles(title), song_productions(productions(name)), song_recording_artists(position, artists(name))")
    .eq("id", songId)
    .single();
  if (error || !song) throw error ?? new Error(`song ${songId} not found`);

  const s = song as any;
  const primary = [...(s.song_recording_artists ?? [])].sort((a: any, b: any) => (a.position ?? 99) - (b.position ?? 99))[0];
  const artist: string | null = primary?.artists?.name ?? s.display_artist ?? null;
  const context: SongContext = {
    title: s.title,
    artist,
    production: (s.song_productions ?? []).map((p: any) => p.productions?.name).filter(Boolean).join(", ") || null,
    wanted: ALL_FIELDS,
  };
  const usage: ModelUsage[] = [];
  const [[gpt, claude, mb, lyrics], landmarks] = await Promise.all([
    Promise.all([
      askGpt(context, usage),
      askClaude(context, usage),
      artist ? lookUpMusicBrainz(s.title, artist) : Promise.resolve(null),
      artist ? lookUpLyrics(s.title, artist) : Promise.resolve(null),
    ]),
    addLandmarkRecordings(admin, songId, { dryRun: true }).catch(() => ({ added: [] as LandmarkResult[], usage: [] as ModelUsage[] })),
  ]);
  const review = reviewEnrichment({ gpt, claude, musicbrainz: mb, spotifyReleaseYear: null, lyrics }, landmarks.added);
  const existingTitles = new Set([s.title, ...(s.song_alternate_titles ?? []).map((t: any) => t.title)].map(norm));
  review.suggestions.alternate_titles = review.suggestions.alternate_titles.filter((t) => !existingTitles.has(norm(t)));
  return { ...review, usage: [...usage, ...landmarks.usage] };
}

// Runs a review and stores it on the song for the editor to pick up. The
// requested-at stamp lets the editor ignore an older run that finishes late.
export async function runEnrichmentReview(admin: SupabaseClient, songId: string, requestedAt: string) {
  let proposal: Record<string, unknown>;
  try {
    const { usage, ...review } = await proposeEnrichment(admin, songId);
    console.log(`[enrich-review] ${songId}: usage ${JSON.stringify(usage)}`);
    proposal = { requested_at: requestedAt, finished_at: new Date().toISOString(), ...review };
  } catch (e) {
    console.error(`[enrich-review] ${songId} failed: ${e instanceof Error ? e.message : String(e)}`);
    proposal = { requested_at: requestedAt, finished_at: new Date().toISOString(), error: true };
  }
  await admin.from("songs").update({ enrichment_proposal: proposal }).eq("id", songId).eq("enrichment_proposal->>requested_at", requestedAt);
}
