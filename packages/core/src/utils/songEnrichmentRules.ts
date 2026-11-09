import {
  SONG_COMMUNITIES,
  SONG_CULTURES,
  SONG_FORMS,
  SONG_GENRES,
  SONG_METERS,
  SONG_OCCASIONS,
  SONG_THEMES,
  SONG_TONALITIES,
} from "./songVocabulary";
import { sameArtist } from "./landmarkRecordings";
import { pickHymnaryText, samePerson, type HymnaryText } from "./hymnary";

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
  forms?: ModelField<string[]>;
  occasions?: ModelField<string[]>;
  communities?: ModelField<string[]>;
  first_line?: ModelField<string>;
  hook?: ModelField<string>;
  // Asked only when a song editor reviews suggestions; never filled automatically.
  notes?: ModelField<string>;
  productions?: ModelField<string[]>;
  alternate_titles?: ModelField<string[]>;
  music_culture?: ModelField<string>;
  lyric_culture?: ModelField<string>;
};

export type EnrichmentSources = {
  gpt: ModelAnswer | null;
  claude: ModelAnswer | null;
  musicbrainz: { recordingYear: number | null; composers: string[]; lyricists: string[] } | null;
  spotifyReleaseYear: number | null;
  lyrics: string | null;
  artist?: string | null;
  // The song's writers already in the catalogue, and Hymnary texts with its title.
  writers?: string[];
  hymnary?: HymnaryText[] | null;
  title?: string;
};

// A spiritual is neither a hymn nor a contemporary worship song, though
// hymnals print many and models often call them that.
export function withoutMisfitForms(forms: string[], genres: string[]): string[] {
  return genres.includes("Spiritual") ? forms.filter((f) => f !== "Hymn" && f !== "Worship song") : forms;
}

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
  forms?: string[];
  occasions?: string[];
  communities?: string[];
  first_line?: string;
  hook?: string;
};

const MAX_TAGS = 3;
const HIGH_OR_MEDIUM: Confidence[] = ["high", "medium"];

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
  // Both models naming the song's own recording artist as its composer counts
  // even when one of them is only fairly sure (Carlebach's Eilecha).
  const gSure = value(g.composers, SURE), cSure = value(c.composers, SURE);
  const artistWroteIt =
    !!src.artist && !!gSure && !!cSure && (gComp || cComp) && sameNames(gSure, cSure) && gSure.every((n) => sameArtist(n, src.artist!));
  // Words default to the composers only when neither model names someone else.
  const lyricistsFor = (composers: string[]) => {
    const named = [value(g.lyricists, ["high", "medium", "low"]), value(c.lyricists, ["high", "medium", "low"])];
    const gLyr = value(g.lyricists, HIGH), cLyr = value(c.lyricists, HIGH);
    if (gLyr && cLyr && sameNames(gLyr, cLyr)) return gLyr;
    return named.some((l) => l && !sameNames(l, composers)) ? undefined : composers;
  };
  if (mb?.composers.length && [gComp, cComp].some((m) => m && m.some((n) => mb.composers.map(norm).includes(norm(n))))) {
    out.composers = mb.composers;
    out.lyricists = mb.lyricists.length ? mb.lyricists : mb.composers;
  } else if (gComp && cComp && sameNames(gComp, cComp)) {
    out.composers = gComp;
    out.lyricists = lyricistsFor(gComp);
  } else if (artistWroteIt) {
    out.composers = gSure!;
    out.lyricists = lyricistsFor(gSure!);
  }
  if (!out.lyricists) delete out.lyricists;

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
  // Both models must name a culture, form, occasion or community for it to be used.
  const bothNamed = (f: "cultures" | "forms" | "occasions" | "communities", allowed: readonly string[]) => {
    const picked = (value(g[f], SURE) ?? []).filter((x) => allowed.includes(x) && (value(c[f], SURE) ?? []).includes(x));
    if (picked.length) out[f] = picked.slice(0, MAX_TAGS);
  };
  bothNamed("cultures", SONG_CULTURES);
  bothNamed("forms", SONG_FORMS);
  bothNamed("occasions", SONG_OCCASIONS);
  bothNamed("communities", SONG_COMMUNITIES);
  const langs = (value(g.languages, SURE) ?? []).filter((x) => (value(c.languages, SURE) ?? []).map(norm).includes(norm(x)));
  if (langs.length) out.languages = langs.slice(0, MAX_TAGS);

  const lines = [value(g.first_line, SURE), value(c.first_line, SURE)].filter((l): l is string => !!l);
  const hooks = [value(g.hook, SURE), value(c.hook, SURE)].filter((l): l is string => !!l);
  if (src.lyrics) {
    const head = norm(src.lyrics.slice(0, 400));
    const all = ` ${norm(src.lyrics)} `;
    const lrc = firstLyricLine(src.lyrics);
    const opensWithAdLib = !!lrc && VOCAL.test(norm(lrc));
    // A model's line at the top of the lyrics wins; failing that, a model's
    // line found later in them beats the lyrics' own first line, which can be a
    // performer's spoken introduction (Tom Dooley's "This one next tells a story…").
    const fromModel =
      lines.find((l) => norm(l).length >= 12 && (head.startsWith(norm(l)) || (opensWithAdLib && head.includes(norm(l))))) ??
      lines.find((l) => norm(l).length >= 12 && all.includes(` ${norm(l)} `));
    if (fromModel) out.first_line = fromModel;
    else if (lrc && lrc.length >= 20 && !VOCAL.test(norm(lrc)) && !/chorus|verse|intro|[{}*]/i.test(lrc)) out.first_line = lrc;
    const hook = hooks.find((h) => all.includes(` ${norm(h)} `));
    if (hook) out.hook = hook;
  } else {
    if (lines.length === 2 && norm(lines[0]) === norm(lines[1])) out.first_line = lines[0];
    if (hooks.length === 2 && norm(hooks[0]) === norm(hooks[1])) out.hook = hooks[0];
  }

  // Hymnary: the hymnals' text of this song (its author must be one of the
  // song's writers, see pickHymnaryText). Its first line is a printed source;
  // its authors and its most-printed tune's composers each need a model to
  // name one of them too.
  const modelLyricists = [...(value(g.lyricists, SURE) ?? []), ...(value(c.lyricists, SURE) ?? [])];
  const modelComposers = [...(value(g.composers, SURE) ?? []), ...(value(c.composers, SURE) ?? [])];
  const hymn = pickHymnaryText(src.hymnary ?? [], src.writers?.length ? src.writers : [...modelComposers, ...modelLyricists], src.title ?? "");
  if (hymn) {
    if (!out.first_line) out.first_line = hymn.firstLine.trim().replace(/[,;:]+$/, "");
    const named = (list: string[], by: string[]) => list.length > 0 && by.some((w) => list.some((n) => samePerson(n, w)));
    if (!out.composers && !out.lyricists && named(hymn.authors, [...modelLyricists, ...modelComposers])) {
      out.lyricists = hymn.authors;
      const tune = hymn.tunes[0];
      if (tune && named(tune.composers, modelComposers)) out.composers = tune.composers;
    }
  }

  return out;
}

// A first line found by web search counts only when a page's own text holds it:
// a citation's quoted text, or the cited page as fetched. Returns the line with
// the page it was found on.
export function verifiedFirstLine(
  answer: { first_line?: string | null; url?: string | null } | null,
  citations: { url: string; cited_text: string }[],
  pages: Record<string, string> = {},
): { first_line: string; url: string } | null {
  const line = answer?.first_line?.trim();
  if (!line || norm(line).length < 20 || norm(line).length > 90 || /chorus|verse|intro/i.test(line)) return null;
  const holds = (text: string) => ` ${norm(text)} `.includes(` ${norm(line)} `);
  const cited = citations.find((c) => holds(c.cited_text));
  if (cited) return { first_line: line, url: cited.url };
  const fetched = Object.entries(pages).find(([, text]) => holds(text));
  return fetched ? { first_line: line, url: fetched[0] } : null;
}

// Items at least two of the lists name (GPT, Claude, the Wikipedia article),
// in the order first given.
function namedByTwo(lists: string[][]): string[] {
  const all = lists.flat().filter((x, i, arr) => arr.findIndex((y) => norm(y) === norm(x)) === i);
  return all.filter((x) => lists.filter((l) => l.some((y) => norm(y) === norm(x))).length >= 2);
}

// Productions and alternate titles for the automatic fill: only what two of
// GPT, Claude and the song's Wikipedia article name.
export function decideListedFacts(
  src: Pick<EnrichmentSources, "gpt" | "claude">,
  wiki: WikipediaFacts | null,
): { productions?: string[]; alternate_titles?: string[] } {
  const out: { productions?: string[]; alternate_titles?: string[] } = {};
  for (const f of ["productions", "alternate_titles"] as const) {
    const agreed = namedByTwo([value(src.gpt?.[f], HIGH_OR_MEDIUM) ?? [], value(src.claude?.[f], HIGH_OR_MEDIUM) ?? [], wiki?.[f] ?? []]);
    if (agreed.length) out[f] = agreed;
  }
  return out;
}

export type EnrichmentReview = {
  suggestions: {
    year_written: number | null;
    first_line: string | null;
    hook: string | null;
    composers: string[];
    lyricists: string[];
    primary_recording_year: number | null;
    tonality: string | null;
    meter: string | null;
    vibe: "Banger" | "Ballad" | null;
    genres: string[];
    themes: string[];
    cultures: string[];
    forms: string[];
    occasions: string[];
    communities: string[];
    music_culture: string | null;
    lyric_culture: string | null;
    languages: string[];
    notes: string | null;
    productions: string[];
    alternate_titles: string[];
    additional_recordings: { artist: string; year: number | null }[];
    genius_url: string | null;
  };
  agreed: string[];
  fromWikipedia: string[];
};

// Facts a model pulled out of the song's Wikipedia article (not from memory).
export type WikipediaFacts = { notes: string | null; productions: string[]; alternate_titles: string[] };

// What a song editor reviews: every value the auto-fill rules accept is marked
// agreed (and pre-ticked), and where they don't, one model's answer is still
// offered, unticked, for a person to judge.
export function reviewEnrichment(
  src: EnrichmentSources,
  landmarks: { artist: string; year: number | null }[],
  extra: { wikipedia?: WikipediaFacts | null; geniusUrl?: string | null } = {},
): EnrichmentReview {
  const d = decideEnrichment(src);
  const g = src.gpt ?? {}, c = src.claude ?? {};
  const HIGH: Confidence[] = ["high"], SURE: Confidence[] = ["high", "medium"];
  const agreed = new Set<string>();
  const one = <T>(f: keyof ModelAnswer, levels = SURE) => (value(g[f] as ModelField<T>, levels) ?? value(c[f] as ModelField<T>, levels)) as T | null;
  const pick = <T>(key: string, decided: T | undefined, fallback: T | null) => {
    if (decided !== undefined) { agreed.add(key); return decided; }
    return fallback;
  };
  const inList = (allowed: readonly string[]) => (v: string | null) => (v && allowed.includes(v) ? v : null);
  const listIn = (allowed: readonly string[]) => (v: string[] | null) => (v ?? []).filter((x) => allowed.includes(x));
  const wiki = extra.wikipedia ?? null;
  const fromWikipedia = new Set<string>();
  // Two of the three (GPT, Claude, the Wikipedia article) naming an item confirms it.
  const bothLists = (key: string, f: "productions" | "alternate_titles") => {
    const lists = [value(g[f], SURE) ?? [], value(c[f], SURE) ?? [], wiki?.[f] ?? []];
    const shared = namedByTwo(lists);
    if (shared.length) { agreed.add(key); return shared; }
    if (wiki?.[f].length) { fromWikipedia.add(key); return wiki[f]; }
    return lists[0].length ? lists[0] : lists[1];
  };
  const culture = (key: "music_culture" | "lyric_culture") => {
    const a = inList(SONG_CULTURES)(value(g[key], SURE)), b = inList(SONG_CULTURES)(value(c[key], SURE));
    if (a && a === b) agreed.add(key);
    return a ?? b;
  };

  const years = [src.musicbrainz?.recordingYear ?? null, value(g.recording_year, HIGH), value(c.recording_year, HIGH), src.spotifyReleaseYear];
  const suggestions: EnrichmentReview["suggestions"] = {
    year_written: pick("year_written", d.year_written, one<number>("year_written", HIGH)),
    first_line: pick("first_line", d.first_line, one<string>("first_line")),
    hook: pick("hook", d.hook, one<string>("hook")),
    composers: pick("composers", d.composers, src.musicbrainz?.composers.length ? src.musicbrainz.composers : one<string[]>("composers", HIGH)) ?? [],
    lyricists: pick("lyricists", d.lyricists, src.musicbrainz?.lyricists.length ? src.musicbrainz.lyricists : one<string[]>("lyricists", HIGH)) ?? [],
    primary_recording_year: pick("primary_recording_year", d.recording_year, years.find((y): y is number => typeof y === "number") ?? null),
    tonality: pick("tonality", d.tonality, inList(SONG_TONALITIES)(one<string>("tonality"))),
    meter: pick("meter", d.meter, inList(SONG_METERS)(one<string>("meter"))),
    vibe: pick("vibe", d.vibe, inList(["Banger", "Ballad"])(one<string>("vibe"))) as "Banger" | "Ballad" | null,
    genres: pick("genres", d.genres, listIn(SONG_GENRES)(one<string[]>("genres")).slice(0, MAX_TAGS)) ?? [],
    themes: pick("themes", d.themes, listIn(SONG_THEMES)(one<string[]>("themes")).slice(0, MAX_TAGS)) ?? [],
    cultures: pick("cultures", d.cultures, listIn(SONG_CULTURES)(one<string[]>("cultures")).slice(0, MAX_TAGS)) ?? [],
    forms: pick("forms", d.forms, listIn(SONG_FORMS)(one<string[]>("forms")).slice(0, MAX_TAGS)) ?? [],
    occasions: pick("occasions", d.occasions, listIn(SONG_OCCASIONS)(one<string[]>("occasions")).slice(0, MAX_TAGS)) ?? [],
    communities: pick("communities", d.communities, listIn(SONG_COMMUNITIES)(one<string[]>("communities")).slice(0, MAX_TAGS)) ?? [],
    languages: pick("languages", d.languages, (one<string[]>("languages") ?? []).slice(0, MAX_TAGS)) ?? [],
    music_culture: culture("music_culture"),
    lyric_culture: culture("lyric_culture"),
    notes: wiki?.notes ?? one<string>("notes"),
    productions: bothLists("productions", "productions"),
    alternate_titles: bothLists("alternate_titles", "alternate_titles"),
    additional_recordings: landmarks,
    genius_url: extra.geniusUrl ?? null,
  };
  if (landmarks.length) agreed.add("additional_recordings");
  if (extra.geniusUrl) agreed.add("genius_url");
  if (wiki?.notes) fromWikipedia.add("notes");
  // The auto-fill tag rule lets one model's extra picks fill up to the cap; in a
  // review, a tag list only counts as confirmed when both models chose every tag.
  for (const f of ["genres", "themes"] as const) {
    const both = (value(g[f], SURE) ?? []).filter((t) => (value(c[f], SURE) ?? []).includes(t));
    if (!suggestions[f].every((t) => both.includes(t))) agreed.delete(f);
  }
  return { suggestions, agreed: [...agreed], fromWikipedia: [...fromWikipedia] };
}
