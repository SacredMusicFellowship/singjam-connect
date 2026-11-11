import { leadArtist, sameArtist } from "./landmarkRecordings";

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const baseTitle = (t: string) => norm(t.replace(/\s*\([^)]*\)/g, ""));
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

// A Genius search hit is only used when it is the same song by the same act.
export function matchesGeniusHit(song: { title: string; artist: string | null }, hit: { title: string; artist: string }): boolean {
  if (!song.artist) return false;
  return baseTitle(hit.title) === baseTitle(song.title) && sameArtist(leadArtist(hit.artist), leadArtist(song.artist));
}

// Same people, allowing for fuller or shorter forms of a name ("Bert Berns" and
// "Bert Russell Berns"), so a suggestion that only respells names isn't a change.
export function samePeople(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x) => b.some((y) => norm(x) === norm(y) || sameArtist(x, y)));
}
