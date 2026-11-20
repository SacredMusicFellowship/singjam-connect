import { leadArtist, sameArtist } from "./landmarkRecordings";

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const baseTitle = (t: string) => norm(t.replace(/\([^()]*\)/g, " "));
const SONG_WORDS = /\b(song|hymn|ballad|carol|single|spiritual|anthem|shanty|lullaby|standard|tune|aria)\b/i;

export type WikipediaPage = { title: string; type: string; description: string | null; extract: string };

// Is this Wikipedia article about this song? Titles clash constantly
// ("Hallelujah", "Cups"), so the article has to name the song, and either name
// its artist or be an article about a song with exactly that title.
export function matchesWikipediaArticle(song: { title: string; artist: string | null }, page: WikipediaPage): boolean {
  if (page.type !== "standard" || !page.extract) return false;
  const text = ` ${norm(page.extract)} `;
  const titles = [...new Set([norm(song.title), baseTitle(song.title)])].filter(Boolean);
  if (!titles.some((t) => text.includes(` ${t} `))) return false;
  const lead = song.artist ? norm(leadArtist(song.artist)) : "";
  if (lead && text.includes(` ${lead} `)) return true;
  return SONG_WORDS.test(page.description ?? "") && titles.includes(baseTitle(page.title));
}

// Genius titles drift in small ways: "The Jug of Punch" for "A Jug of Punch",
// "Wabash Cannon Ball (1947)", "Drinking Gourd" for "Drinkin' Gourd".
// Titles are bounded and the bracket patterns can't nest, so no input can make
// these patterns backtrack.
const geniusTitleKey = (t: string) =>
  norm(t.slice(0, 300).replace(/[([][^()[\]]*[)\]]/g, " ").replace(/in['’‘](?![a-z])/gi, "ing")).replace(/^(the|a|an) /, "").replace(/ /g, "");
const compact = (s: string) => norm(s).replace(/ /g, "");

// The song's own title, the words in its brackets ("Hold On (Keep Your Hand on
// the Plow)") and its alternate titles.
function geniusTitles(song: GeniusSong): Set<string> {
  const inBrackets = [...song.title.slice(0, 300).matchAll(/\(([^()]+)\)/g)].map((m) => m[1]).filter((t) => t.trim().split(/\s+/).length >= 2);
  return new Set([song.title, ...inBrackets, ...(song.alternateTitles ?? [])].map(geniusTitleKey).filter(Boolean));
}

const sameAct = (a: string, b: string) => {
  const x = leadArtist(a), y = leadArtist(b);
  return sameArtist(x, y) || (compact(x).length >= 4 && compact(x) === compact(y));
};

export type GeniusSong = { title: string; alternateTitles?: string[]; artists: string[]; writers: string[] };
export type GeniusHit = { title: string; artist: string };
export type GeniusSongDetails = GeniusHit & { writers: string[]; coverOf: string[] };

const TRADITIONAL = /^traditional\b/i;
const isTraditional = (song: GeniusSong) => song.writers.some((w) => TRADITIONAL.test(w));
const namedWriters = (song: GeniusSong) => song.writers.filter((w) => !TRADITIONAL.test(w));

export function sameGeniusTitle(song: GeniusSong, hit: GeniusHit): boolean {
  return geniusTitles(song).has(geniusTitleKey(hit.title));
}

// A Genius search hit is used straight away when it has the song's title and is
// by one of its recording artists or writers.
export function matchesGeniusHit(song: GeniusSong, hit: GeniusHit): boolean {
  if (!sameGeniusTitle(song, hit)) return false;
  return [...song.artists, ...namedWriters(song)].some((a) => sameAct(a, hit.artist));
}

// Any other act's version with the song's title needs Genius's own song page
// to confirm it: the same writers, or a cover of the traditional song when
// the song is traditional. "Over My Head" by Fleetwood Mac never stands in
// for the spiritual.
export function confirmsGeniusSong(song: GeniusSong, hit: GeniusSongDetails): boolean {
  if (!sameGeniusTitle(song, hit)) return false;
  if (matchesGeniusHit(song, hit)) return true;
  if (hit.writers.some((w) => namedWriters(song).some((x) => sameAct(w, x)))) return true;
  return isTraditional(song) && [hit.artist, ...hit.writers, ...hit.coverOf].some((a) => TRADITIONAL.test(a));
}

// Same people, allowing for fuller or shorter forms of a name ("Bert Berns" and
// "Bert Russell Berns"), so a suggestion that only respells names isn't a change.
export function samePeople(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x) => b.some((y) => norm(x) === norm(y) || sameArtist(x, y)));
}
