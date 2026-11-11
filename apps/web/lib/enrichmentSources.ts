import Anthropic from "@anthropic-ai/sdk";
import {
  hymnaryTextsFor,
  hymnaryTunes,
  matchesGeniusHit,
  matchesWikipediaArticle,
  parseCsvRecords,
  verifiedFirstLine,
  type HymnaryText,
  type ModelAnswer,
  type WikipediaFacts,
} from "@singjam/core";
import { askClaudeJson, type ModelUsage } from "@/lib/enrichmentModels";

// The outside sources enrichment consults besides the two models: MusicBrainz,
// LRCLIB lyrics, Wikipedia, Genius, Hymnary.org and a web search for first lines.

export const USER_AGENT = "SingJam/1.0 ( https://singjam.org )";
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim().replace(/^the /, "");

export type Field = keyof ModelAnswer;
export type SongContext = {
  title: string;
  artist: string | null;
  production: string | null;
  wanted: Field[];
  artists?: string[];
  writers?: string[];
  firstLine?: string | null;
};

export async function musicbrainz(path: string) {
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
export async function lookUpMusicBrainz(title: string, artist: string) {
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

export async function lookUpLyrics(title: string, artist: string): Promise<string | null> {
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
export async function lookUpWikipedia(title: string, artist: string | null) {
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
export async function extractWikipediaFacts(title: string, extract: string, usage: ModelUsage[]): Promise<WikipediaFacts | null> {
  return askClaudeJson<WikipediaFacts>({
    system: "You extract facts from a Wikipedia excerpt. Use only what the excerpt states; never add facts from memory.",
    user: `Song: "${title}"\n\nWikipedia excerpt:\n${extract}\n\nReturn JSON with:
- notes: two or three sentences, in your own words (do not copy phrasing), on the song's origin and history that a musician would find useful. Null if the excerpt has nothing useful.
- productions: the film, musical or TV show the excerpt says the song was written for or first introduced in. Not productions that later used an existing song or recording. Empty if none.
- alternate_titles: other titles the excerpt says the song is known by, excluding "${title}". Empty if none.`,
  }, WIKI_FACTS_SCHEMA, null, 4000, "wikipedia facts", usage);
}

// Genius search does badly with bracketed subtitles, so it gets the bare title,
// once per recording artist until one matches.
export async function lookUpGenius(title: string, artists: string[]): Promise<string | null> {
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
export async function lookUpHymnary(title: string): Promise<HymnaryText[] | null> {
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
