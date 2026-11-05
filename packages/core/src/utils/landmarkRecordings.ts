// Other recordings worth listing on a song: only versions both models name as
// iconic on their own, confirmed to exist on MusicBrainz. Most songs get none.

export type LandmarkCandidate = { artist: string; year: number; why: "original" | "iconic" };
export type AgreedLandmark = { artist: string; altArtist: string; gptYear: number; claudeYear: number; why: LandmarkCandidate["why"] };

// A song shows at most this many recordings, the one it was added with included.
export const MAX_RECORDINGS = 4;

const STOP = new Set(["the", "and", "his", "her", "their", "orchestra", "band"]);
const tokens = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’'‘`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((w) => w && !STOP.has(w));

// "Collins and Harlan" is "Arthur Collins & Byron Harlan"; "Isley Brothers" is
// "The Isley Brothers". A one-word name only matches itself, so "Elvis" never
// matches "Elvis Costello".
export function sameArtist(a: string, b: string): boolean {
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return false;
  if (x.join(" ") === y.join(" ")) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 2 && short.every((w) => long.includes(w));
}

// The first-named artist, for searching: "Bing Crosby & Connee Boswell" → "Bing Crosby".
export function leadArtist(name: string): string {
  // Spaces collapsed first (and the length bounded) so the split can't backtrack.
  const flat = name.slice(0, 300).replace(/\s+/g, " ");
  return flat.split(/ (?:&|and|with|featuring|feat\.?|ft\.?) |, ?/i)[0].trim();
}

// Recordings both models listed (matched by artist), minus artists the song
// already has, capped so the song stays within MAX_RECORDINGS.
export function agreedLandmarks(
  gpt: LandmarkCandidate[] | null,
  claude: LandmarkCandidate[] | null,
  existingArtists: string[],
): AgreedLandmark[] {
  if (!gpt?.length || !claude?.length) return [];
  const out: AgreedLandmark[] = [];
  for (const g of gpt) {
    const c = claude.find((x) => sameArtist(x.artist, g.artist));
    if (!c) continue;
    if ([...existingArtists, ...out.map((o) => o.artist)].some((a) => sameArtist(a, g.artist))) continue;
    out.push({ artist: g.artist, altArtist: c.artist, gptYear: g.year, claudeYear: c.year, why: g.why === c.why ? g.why : "iconic" });
  }
  return out.slice(0, Math.max(0, MAX_RECORDINGS - existingArtists.length));
}

// MusicBrainz's earliest dated studio release wins when it is close to both
// models' years; otherwise both models must give the same year. With neither,
// the recording is still listed, just without a year.
export function landmarkYear(gptYear: number, claudeYear: number, musicbrainzYear: number | null): number | null {
  if (musicbrainzYear != null && Math.abs(musicbrainzYear - gptYear) <= 2 && Math.abs(musicbrainzYear - claudeYear) <= 2) return musicbrainzYear;
  return gptYear === claudeYear ? gptYear : null;
}
