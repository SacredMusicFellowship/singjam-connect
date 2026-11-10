import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  usageCost,
  withoutGenericFaithThemes,
  withoutMisfitForms,
  verifiedFirstLine,
  parseCsvRecords,
  hymnaryTextsFor,
  hymnaryTunes,
  type HymnaryText,
  agreedLandmarks,
  firstRecordingCandidates,
  firstRecordingYear,
  type RecordingCandidate,
  decideEnrichment,
  decideListedFacts,
  matchesGeniusHit,
  matchesWikipediaArticle,
  landmarkYear,
  leadArtist,
  MAX_RECORDINGS,
  sameArtist,
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
  type LandmarkCandidate,
  type ModelAnswer,
  type WikipediaFacts,
} from "@singjam/core";

import { findOnSpotify } from "@/lib/songLookup";

const USER_AGENT = "SingJam/1.0 ( https://singjam.org )";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

type Field = keyof ModelAnswer;
export type ModelUsage = { model: string; input: number; output: number; reasoning?: number; searches?: number };
export type SongContext = {
  title: string;
  artist: string | null;
  production: string | null;
  wanted: Field[];
  artists?: string[];
  writers?: string[];
  firstLine?: string | null;
};

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

function blankToNull(answer: ModelAnswer | null): ModelAnswer | null {
  if (!answer) return null;
  const out: Record<string, unknown> = {};
  for (const [field, a] of Object.entries(answer) as [string, { v: unknown; c: string } | null][])
    out[field] = a && (a.v === "" || a.v === 0 || (Array.isArray(a.v) && !a.v.length)) ? { ...a, v: null } : a;
  return out as ModelAnswer;
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
    return text && text.type === "text" ? blankToNull(JSON.parse(text.text).fields ?? null) : null;
  } catch (e) {
    console.error("[song-enrichment] claude failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function musicbrainz(path: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, { headers: { "User-Agent": USER_AGENT } }).catch(() => null);
    await sleep(1100);
    if (!res) continue;
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

// ---- Wikipedia and Genius (review only) ----

const WIKI = "https://en.wikipedia.org";

// The song's article, if one can be found that is really about this song.
async function lookUpWikipedia(title: string, artist: string | null) {
  const q = `${title} ${artist ?? ""} song`.trim();
  const search = await fetch(`${WIKI}/w/api.php?action=query&list=search&srlimit=5&format=json&srsearch=${encodeURIComponent(q)}`, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!search.ok) return null;
  const hits: { title: string }[] = (await search.json()).query?.search ?? [];
  for (const hit of hits) {
    const res = await fetch(`${WIKI}/api/rest_v1/page/summary/${encodeURIComponent(hit.title.replace(/ /g, "_"))}`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) continue;
    const page = await res.json();
    const candidate = { title: page.title ?? hit.title, type: page.type ?? "", description: page.description ?? null, extract: page.extract ?? "" };
    if (matchesWikipediaArticle({ title, artist }, candidate))
      return { ...candidate, url: page.content_urls?.desktop?.page ?? `${WIKI}/wiki/${encodeURIComponent(hit.title.replace(/ /g, "_"))}` };
  }
  return null;
}

const WIKI_FACTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["notes", "productions", "alternate_titles"],
  properties: {
    notes: { type: ["string", "null"] },
    productions: { type: "array", items: { type: "string" } },
    alternate_titles: { type: "array", items: { type: "string" } },
  },
};

// Pulls facts out of the article text (Wikipedia is CC BY-SA, so notes are
// written fresh, never copied). Kept apart from the two research calls so the
// models' agreement elsewhere stays independent of the article.
async function extractWikipediaFacts(title: string, extract: string, usage: ModelUsage[]): Promise<WikipediaFacts | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const res = await new Anthropic().beta.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: WIKI_FACTS_SCHEMA } },
    system: "You extract facts from a Wikipedia excerpt. Use only what the excerpt states; never add facts from memory.",
    messages: [{
      role: "user",
      content: `Song: "${title}"\n\nWikipedia excerpt:\n${extract}\n\nReturn JSON with:
- notes: two or three sentences, in your own words (do not copy phrasing), on the song's origin and history that a musician would find useful. Null if the excerpt has nothing useful.
- productions: the film, musical or TV show the excerpt says the song was written for or first introduced in. Not productions that later used an existing song or recording. Empty if none.
- alternate_titles: other titles the excerpt says the song is known by, excluding "${title}". Empty if none.`,
    }],
  });
  usage.push({ model: res.model, input: res.usage.input_tokens, output: res.usage.output_tokens });
  if (res.stop_reason === "refusal") return null;
  const text = res.content.find((b) => b.type === "text");
  return text && text.type === "text" ? JSON.parse(text.text) : null;
}

// Genius search does badly with bracketed subtitles, so it gets the bare title,
// once per recording artist until one matches.
async function lookUpGenius(title: string, artists: string[]): Promise<string | null> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) return null;
  const bare = title.replace(/\s*\([^)]*\)/g, "").trim() || title;
  for (const artist of artists.slice(0, 4)) {
    const res = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(`${bare} ${artist}`)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) continue;
    const hits: any[] = (await res.json()).response?.hits ?? [];
    const hit = hits.map((h) => h.result).find((r) => r && matchesGeniusHit({ title, artist }, { title: r.title ?? "", artist: r.primary_artist?.name ?? "" }));
    if (hit?.url) return hit.url;
  }
  return null;
}

// ---- Hymnary.org (hymnals' texts and tunes; its CSV search export) ----

async function hymnarySearch(query: string) {
  const res = await fetch(`https://hymnary.org/search?qu=${encodeURIComponent(query)}&export=csv`, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(20_000),
  });
  return res.ok ? parseCsvRecords(await res.text()) : null;
}

// Texts titled like the song (the two most printed), each with its tunes.
// decideEnrichment picks the one that is this song, if any.
async function lookUpHymnary(title: string): Promise<HymnaryText[] | null> {
  const records = await hymnarySearch(`textName:${title.replace(/[():"]/g, " ")} in:texts`);
  if (!records) return null;
  const texts: HymnaryText[] = [];
  for (const t of hymnaryTextsFor(title, records).slice(0, 2)) {
    const id = t.url.split("/").pop();
    const tunes = await hymnarySearch(`textAuthNumber:"^${id}$" in:tunes`);
    texts.push({ ...t, tunes: tunes ? hymnaryTunes(tunes) : [] });
  }
  return texts;
}

// ---- First line by web search (songs nothing else could place) ----

async function pageText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.text()).replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ");
  } catch {
    return null;
  }
}

// Claude searches the web for a page that prints the words; the line is kept
// only if that page's own text holds it (verifiedFirstLine), never from memory.
export async function searchFirstLine(
  song: SongContext,
  usage: ModelUsage[],
  model = "claude-opus-5-5",
): Promise<{ first_line: string; url: string } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const about = [
    song.writers?.length ? `written by ${song.writers.join(", ")}` : null,
    song.artist ? `recorded by ${song.artist}` : null,
  ].filter(Boolean).join(", ");
  const messages: any[] = [{
    role: "user",
    content: `Find the first sung line of the song "${song.title}"${about ? ` (${about})` : ""}. Search the web for a page that prints its words, such as a hymnal, songbook, folk song archive or lyrics page, and copy its first line exactly as that page prints it: one line only (usually under 12 words), not the whole verse or a repeated refrain, without section labels. If versions differ, use the most widely printed one. Never answer from memory.
Reply with only JSON: {"first_line": "...", "url": "<the page it is on>"}, or {"first_line": null, "url": null} if no page prints it.`,
  }];
  const client = new Anthropic();
  const citations: { url: string; cited_text: string }[] = [];
  let text = "";
  for (let turn = 0; turn < 3; turn++) {
    const res: any = await client.beta.messages.create({
      model,
      max_tokens: 16000,
      ...(model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
      output_config: { effort: "low" },
      tools: [{ type: model.startsWith("claude-haiku") ? "web_search_20250305" : "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages,
    } as any);
    usage.push({ model: res.model, input: res.usage.input_tokens, output: res.usage.output_tokens, searches: res.usage.server_tool_use?.web_search_requests ?? 0 });
    for (const block of res.content ?? []) {
      if (block.type !== "text") continue;
      text += block.text;
      for (const c of block.citations ?? []) if (c.url && c.cited_text) citations.push({ url: c.url, cited_text: c.cited_text });
    }
    if (res.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: res.content });
  }
  const json = text.match(/\{[^{}]*"first_line"[^{}]*\}/g)?.pop();
  let answer: { first_line?: string | null; url?: string | null } | null = null;
  try { answer = json ? JSON.parse(json) : null; } catch { answer = null; }
  if (!answer?.first_line) return null;
  const found = verifiedFirstLine(answer, citations);
  if (found) return found;
  const urls = [answer.url, ...citations.map((c) => c.url)].filter((u, i, all): u is string => !!u && all.indexOf(u) === i).slice(0, 3);
  const pages: Record<string, string> = {};
  for (const url of urls) {
    const t = await pageText(url);
    if (t) pages[url] = t;
  }
  return verifiedFirstLine(answer, [], pages);
}

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

const FIRST_RECORDING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["recordings"],
  properties: {
    recordings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["artist", "year", "why", "recorded_title"],
        properties: {
          artist: { type: "string" }, year: { type: "integer" }, why: { type: "string", enum: ["original", "iconic"] }, recorded_title: { type: "string" },
        },
      },
    },
  },
};

type FirstRecordingSong = { title: string; writers: string[]; firstLine: string | null; tags: string[] };

function firstRecordingPrompt(s: FirstRecordingSong) {
  const system = "You are a careful music researcher. Accuracy matters more than coverage: a wrong recording is far worse than a missing one.";
  const user = `Song: "${s.title}"${s.writers.length ? `, written by ${s.writers.join(", ")}` : ""}${s.firstLine ? `, first line "${s.firstLine}"` : ""}${s.tags.length ? ` (${s.tags.join("; ")})` : ""}.
Name the recordings of THIS song (not another song with the same title) that people would most likely know it from: the original recording if it is still known, or the best-known later recording. For a traditional, folk, children's, barbershop or hymn-like song, a widely known recording by a well-known performer or group counts.
Never list: novelty or parody covers, karaoke or "kids' sing-along" compilations by anonymous studio groups, or recordings you are not sure exist. At most 3; an empty list is fine. Use the artist's credited name and the year that recording was first released.
Return JSON: {"recordings": [{"artist", "year", "why", "recorded_title"}]} where why is "original" or "iconic" and recorded_title is the title as printed on that recording.`;
  return { system, user };
}

async function askGptFirstRecordings(s: FirstRecordingSong, usage: ModelUsage[]): Promise<RecordingCandidate[] | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const { system, user } = firstRecordingPrompt(s);
    const res = await new OpenAI().chat.completions.create({
      model: "gpt-5.5",
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    });
    usage.push({ model: res.model, input: res.usage?.prompt_tokens ?? 0, output: res.usage?.completion_tokens ?? 0, reasoning: res.usage?.completion_tokens_details?.reasoning_tokens ?? 0 });
    return JSON.parse(res.choices[0].message.content ?? "{}").recordings ?? null;
  } catch (e) {
    console.error("[song-enrichment] gpt first recordings failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

async function askClaudeFirstRecordings(s: FirstRecordingSong, usage: ModelUsage[]): Promise<RecordingCandidate[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const { system, user } = firstRecordingPrompt(s);
    const res: any = await new Anthropic().beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: FIRST_RECORDING_SCHEMA } },
      system,
      messages: [{ role: "user", content: user }],
    } as any);
    usage.push({ model: res.model, input: res.usage.input_tokens, output: res.usage.output_tokens });
    if (res.stop_reason === "refusal") return null;
    const text = res.content.find((b: any) => b.type === "text");
    return text ? JSON.parse(text.text).recordings ?? null : null;
  } catch (e) {
    console.error("[song-enrichment] claude first recordings failed:", e instanceof Error ? e.message : e);
    return null;
  }
}

// A Spotify link only when the track really is this recording (title and artist).
async function spotifyFor(title: string, artist: string): Promise<string | null> {
  const hit = await findOnSpotify(title, leadArtist(artist)).catch(() => null);
  return hit && norm(hit.title) === norm(title) && (sameArtist(hit.artist, artist) || norm(hit.artist) === norm(leadArtist(artist))) ? hit.spotify_url : null;
}

export type FirstRecordingResult = { artist: string; year: number | null; title: string };

// A song added with no recording (a folk song, spiritual or hymn added by its
// writers) gets up to two recordings people know it from: named by a model and
// confirmed on MusicBrainz, under the song's title or the title on that record.
// A record's own title ("Erie Canal" for "Low Bridge") is kept on the recording
// (YouTube is searched with it) and as an alternate title (search finds it).
// Runs when a song is added, not from the cron. ~3¢ a song.
export async function addFirstRecordings(admin: SupabaseClient, songId: string, opts: { dryRun?: boolean } = {}) {
  const usage: ModelUsage[] = [];
  const { data: song } = await admin
    .from("songs")
    .select("title, first_line, youtube_url, tune_id, known_by_recording, song_recording_artists(count), song_composers(people(name)), song_lyricists(people(name)), song_tags(context, tags(type, name))")
    .eq("id", songId)
    .single();
  const s = song as any;
  // A song that names its tune (Love Divine to Hyfrydol) or already has a
  // reference recording is left alone: a model can't tell which melody a
  // recording of the words uses. Nor one marked as not known by a recording (a
  // camp song: a model will find a different song with the same title).
  if (!s || s.song_recording_artists?.[0]?.count || s.tune_id || s.youtube_url || s.known_by_recording === false) return { added: [] as FirstRecordingResult[], usage };
  const writers = [...(s.song_composers ?? []), ...(s.song_lyricists ?? [])]
    .map((r: any) => r.people?.name as string | undefined)
    .filter((n, i, all): n is string => !!n && all.indexOf(n) === i);
  const tags = (s.song_tags ?? []).filter((t: any) => t.context === "general" && ["genre", "form", "community"].includes(t.tags?.type)).map((t: any) => t.tags.name as string);
  const ask = { title: s.title as string, writers, firstLine: s.first_line ?? null, tags };
  const [gpt, claude] = await Promise.all([askGptFirstRecordings(ask, usage), askClaudeFirstRecordings(ask, usage)]);

  const added: FirstRecordingResult[] = [];
  for (const pick of firstRecordingCandidates(gpt, claude)) {
    if (added.length >= 2) break;
    const titles = [s.title as string, ...pick.titles].filter((t, i, all) => all.findIndex((u) => norm(u) === norm(t)) === i);
    let found: { credit: string; year: number | null } | null = null;
    let asTitle = s.title as string;
    for (const t of titles) {
      found = await musicBrainzRecording(t, pick.artist);
      if (found) { asTitle = t; break; }
    }
    if (!found || added.some((a) => sameArtist(a.artist, found!.credit))) continue;
    const year = firstRecordingYear(pick.years, found.year);
    added.push({ artist: found.credit, year, title: asTitle });
    if (opts.dryRun) continue;
    const [artistId] = await idsFor(admin, "artists", [found.credit]);
    if (!artistId) continue;
    const recordedTitle = norm(asTitle) === norm(s.title) ? null : asTitle;
    await admin.from("song_recording_artists").insert({
      song_id: songId, artist_id: artistId, year, position: added.length, recorded_title: recordedTitle,
      spotify_url: await spotifyFor(asTitle, found.credit),
    });
    // "Auld Lang Syne (The New Year's Anthem)" is the title plus a subtitle, not another name.
    if (recordedTitle && !norm(recordedTitle).startsWith(norm(s.title))) await admin.from("song_alternate_titles").upsert({ song_id: songId, title: recordedTitle }, { onConflict: "song_id,title", ignoreDuplicates: true });
  }
  return { added, usage };
}

export async function idsFor(admin: SupabaseClient, table: "people" | "languages" | "artists", names: string[]) {
  const ids: string[] = [];
  for (const name of names) {
    const { data: found } = await admin.from(table).select("id").ilike("name", name).limit(1).maybeSingle();
    const id = found?.id ?? (await admin.from(table).insert({ name }).select("id").single()).data?.id;
    if (id) ids.push(id);
  }
  return ids;
}

// Tags of one type by exact name. Only languages may be created; every other
// vocabulary is fixed (the decision already kept to the approved lists).
export async function tagIds(admin: SupabaseClient, type: TagType, names: string[]) {
  const { data } = await admin.from("tags").select("id, name").eq("type", type).in("name", names);
  const ids = (data ?? []).map((r) => r.id as string);
  if (type === "language") {
    const known = new Set((data ?? []).map((r) => norm(r.name as string)));
    for (const name of names.filter((n) => !known.has(norm(n)))) {
      const { data: found } = await admin.from("tags").select("id").eq("type", "language").ilike("name", name).limit(1).maybeSingle();
      const id = found?.id ?? (await admin.from("tags").insert({ type: "language", name, slug: name }).select("id").single()).data?.id;
      if (id) ids.push(id);
    }
  }
  return ids;
}

// Gathers every source for one song, decides with the shared rules, and fills
// only fields that are still empty — nothing someone has set is overwritten.
// Keeps what a run cost (migration 214). Best effort: a failed write never
// fails the enrichment itself.
export async function recordEnrichmentUsage(admin: SupabaseClient, songId: string, kind: "fill" | "review", usage: ModelUsage[]) {
  if (!usage.length) return;
  const { usd, unpriced } = usageCost(usage);
  if (unpriced.length) console.warn(`[song-enrichment] no price for ${unpriced.join(", ")}; cost recorded without them`);
  const { error } = await admin.from("song_enrichment_runs").insert({ song_id: songId, kind, usage, cost_usd: Number(usd.toFixed(5)) });
  if (error) console.error("[song-enrichment] couldn't record usage:", error.message);
}

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
