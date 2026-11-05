import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  decideEnrichment,
  SONG_CULTURES,
  SONG_GENRES,
  SONG_METERS,
  SONG_THEMES,
  SONG_TONALITIES,
  type EnrichmentDecision,
  type EnrichmentSources,
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
};

const ARRAY_FIELDS = new Set<Field>(["composers", "lyricists", "genres", "themes", "languages", "cultures"]);
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

async function idsFor(admin: SupabaseClient, table: "people" | "languages", names: string[]) {
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
    return await fillSong(admin, songId, s, primary, artist, wanted, opts);
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
