import { SONG_CULTURES, SONG_GENRES, SONG_METERS, SONG_THEMES, SONG_TONALITIES } from "./songVocabulary";

export type Confidence = "high" | "medium" | "low";
export type ModelField<T> = { v: T | null; c: Confidence } | null | undefined;

export type ModelAnswer = {
  year_written?: ModelField<number>;
  recording_year?: ModelField<number>;
  composers?: ModelField<string[]>;
  lyricists?: ModelField<string[]>;
  tonality?: ModelField<string>;
  meter?: ModelField<string>;
  vibe?: ModelField<string>;
  genres?: ModelField<string[]>;
  themes?: ModelField<string[]>;
  languages?: ModelField<string[]>;
  cultures?: ModelField<string[]>;
  first_line?: ModelField<string>;
  hook?: ModelField<string>;
};

export type EnrichmentSources = {
  gpt: ModelAnswer | null;
  claude: ModelAnswer | null;
  musicbrainz: { recordingYear: number | null; composers: string[]; lyricists: string[] } | null;
  spotifyReleaseYear: number | null;
  lyrics: string | null;
};

export type EnrichmentDecision = {
  recording_year?: number;
  year_written?: number;
  composers?: string[];
  lyricists?: string[];
  tonality?: string;
  meter?: string;
  vibe?: string;
  genres?: string[];
  themes?: string[];
  languages?: string[];
  cultures?: string[];
  first_line?: string;
  hook?: string;
};

const MAX_TAGS = 3;

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const value = <T>(f: ModelField<T>, levels: Confidence[]): T | null =>
  f && f.v !== null && f.v !== undefined && (!Array.isArray(f.v) || f.v.length) && levels.includes(f.c) ? f.v : null;

const sameNames = (a: string[], b: string[]) =>
  a.length === b.length && [...a].map(norm).sort().join("|") === [...b].map(norm).sort().join("|");

const VOCAL = /^((oh|ooh|yeah|hey|mm+|mh|hm+|la|na|whoa|uh|ah|a)\s*)+$/;

function firstLyricLine(lyrics: string): string | null {
  for (const raw of lyrics.split("\n")) {
    const line = raw.trim();
    if (line && !/^[[(].*[\])]$/.test(line)) return line;
  }
  return null;
}

// Tags both models chose come first; GPT's remaining picks fill up to the cap.
function mergeTags(gpt: string[] | null, claude: string[] | null, allowed: readonly string[]): string[] | undefined {
  const ok = (list: string[] | null) => (list ?? []).filter((t) => allowed.includes(t));
  const g = ok(gpt), c = ok(claude);
  const both = g.filter((t) => c.includes(t));
  const merged = g.length ? [...both, ...g.filter((t) => !both.includes(t))] : c;
  return merged.length ? merged.slice(0, MAX_TAGS) : undefined;
}

// Every fact needs two independent signals — two models agreeing, or a model
// confirmed by MusicBrainz / Spotify / LRCLIB. A field with only one signal, or
// with signals that disagree, is left out rather than guessed.
export function decideEnrichment(src: EnrichmentSources): EnrichmentDecision {
  const out: EnrichmentDecision = {};
  const g = src.gpt ?? {}, c = src.claude ?? {};
  const HIGH: Confidence[] = ["high"], SURE: Confidence[] = ["high", "medium"];

  const gYear = value(g.recording_year, HIGH), cYear = value(c.recording_year, HIGH);
  const mbYear = src.musicbrainz?.recordingYear ?? null, spYear = src.spotifyReleaseYear;
  const votes = [gYear, cYear, mbYear, spYear].filter((y): y is number => typeof y === "number");
  const agreedYears = votes.filter((y) => votes.filter((x) => x === y).length >= 2);
  if (agreedYears.length) out.recording_year = Math.min(...agreedYears);

  const gWritten = value(g.year_written, HIGH), cWritten = value(c.year_written, HIGH);
  if (gWritten && gWritten === cWritten && (!out.recording_year || gWritten <= out.recording_year)) out.year_written = gWritten;

  const mb = src.musicbrainz;
  const gComp = value(g.composers, HIGH), cComp = value(c.composers, HIGH);
  if (mb?.composers.length && [gComp, cComp].some((m) => m && m.some((n) => mb.composers.map(norm).includes(norm(n))))) {
    out.composers = mb.composers;
    out.lyricists = mb.lyricists.length ? mb.lyricists : mb.composers;
  } else if (gComp && cComp && sameNames(gComp, cComp)) {
    out.composers = gComp;
    const gLyr = value(g.lyricists, HIGH), cLyr = value(c.lyricists, HIGH);
    out.lyricists = gLyr && cLyr && sameNames(gLyr, cLyr) ? gLyr : gComp;
  }

  const agree = (field: "tonality" | "meter" | "vibe", allowed: readonly string[]) => {
    const a = value(g[field], SURE), b = value(c[field], SURE);
    if (a !== null && b !== null && String(a) === String(b) && allowed.includes(String(a))) out[field] = String(a);
  };
  agree("tonality", SONG_TONALITIES);
  agree("meter", SONG_METERS);
  agree("vibe", ["Banger", "Ballad"]);

  const genres = mergeTags(value(g.genres, SURE), value(c.genres, SURE), SONG_GENRES);
  if (genres) out.genres = genres;
  const themes = mergeTags(value(g.themes, SURE), value(c.themes, SURE), SONG_THEMES);
  if (themes) out.themes = themes;
  const cultures = (value(g.cultures, SURE) ?? []).filter((x) => SONG_CULTURES.includes(x) && (value(c.cultures, SURE) ?? []).includes(x));
  if (cultures.length) out.cultures = cultures.slice(0, MAX_TAGS);
  const langs = (value(g.languages, SURE) ?? []).filter((x) => (value(c.languages, SURE) ?? []).map(norm).includes(norm(x)));
  if (langs.length) out.languages = langs.slice(0, MAX_TAGS);

  const lines = [value(g.first_line, SURE), value(c.first_line, SURE)].filter((l): l is string => !!l);
  const hooks = [value(g.hook, SURE), value(c.hook, SURE)].filter((l): l is string => !!l);
  if (src.lyrics) {
    const head = norm(src.lyrics.slice(0, 400));
    const all = ` ${norm(src.lyrics)} `;
    const lrc = firstLyricLine(src.lyrics);
    const opensWithAdLib = !!lrc && VOCAL.test(norm(lrc));
    const fromModel = lines.find((l) => norm(l).length >= 12 && (head.startsWith(norm(l)) || (opensWithAdLib && head.includes(norm(l)))));
    if (fromModel) out.first_line = fromModel;
    else if (lrc && lrc.length >= 20 && !VOCAL.test(norm(lrc)) && !/chorus|verse|intro|[{}*]/i.test(lrc)) out.first_line = lrc;
    const hook = hooks.find((h) => all.includes(` ${norm(h)} `));
    if (hook) out.hook = hook;
  } else {
    if (lines.length === 2 && norm(lines[0]) === norm(lines[1])) out.first_line = lines[0];
    if (hooks.length === 2 && norm(hooks[0]) === norm(hooks[1])) out.hook = hooks[0];
  }

  return out;
}
