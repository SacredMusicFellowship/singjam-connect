import { isSameArtistName } from "./sameSong";

// What the person adding a song can tell us beyond its title and artist. All
// optional; each is a hint to enrichment, never a fact on its own.

export const KNOWN_AS = [
  { value: "recording", label: "A recording" },
  { value: "traditional", label: "Traditional or folk" },
  { value: "hymn", label: "Hymn, carol or worship" },
  { value: "show", label: "A show or film" },
] as const;

export type KnownAs = (typeof KNOWN_AS)[number]["value"];

export type SongAddHints = {
  known_as?: KnownAs;
  // How the person says it starts: kept as the first line only once lyrics or a hymnal hold it.
  first_line?: string;
  // Tag names of the jam the song was added for ("Christmas", "Christian").
  context?: string[];
  // Set by the server, never the client: added as another tune of a text we
  // hold, identified by the recording link given with it. The tune name is what
  // the person called it when it matched no tune we have.
  other_tune?: true;
  tune?: string;
};

// A tune name someone typed, or null when it's too short or long to be one.
export function cleanTuneName(input: unknown): string | null {
  const name = typeof input === "string" ? input.trim().replace(/\s+/g, " ") : "";
  return name.length >= 2 && name.length <= 80 ? name : null;
}

const KNOWN = new Set<string>(KNOWN_AS.map((k) => k.value));

export function parseAddHints(input: { known_as?: unknown; first_line_hint?: unknown }, context: string[] = []): SongAddHints | null {
  const hints: SongAddHints = {};
  if (typeof input.known_as === "string" && KNOWN.has(input.known_as)) hints.known_as = input.known_as as KnownAs;
  const line = typeof input.first_line_hint === "string" ? input.first_line_hint.trim().replace(/\s+/g, " ") : "";
  if (line.length >= 3 && line.length <= 200) hints.first_line = line;
  const ctx = [...new Set(context.map((c) => c.trim()).filter(Boolean))].slice(0, 8);
  if (ctx.length) hints.context = ctx;
  return Object.keys(hints).length ? hints : null;
}

// Spotify credits some tracks to "Traditional" or "Various Artists": a credit,
// not a performer, so it never becomes the song's recording artist.
const PLACEHOLDER_ARTISTS = /^(traditional|trad|anonymous|anon|unknown|unknown artists?|various|various artists|traditional (carol|folk|hymn|song))$/;
export function isPlaceholderArtist(name: string | null | undefined): boolean {
  return !!name && PLACEHOLDER_ARTISTS.test(name.trim().toLowerCase().replace(/\.$/, ""));
}

// Lines added to the enrichment prompt.
export function addHintLines(hints: SongAddHints | null | undefined, artist: string | null): string[] {
  if (!hints) return [];
  const cover = artist ? `; ${artist}'s recording is one version of it, so describe the song itself` : "";
  const lines: string[] = [];
  if (hints.known_as === "traditional") lines.push(`The person adding it says it's a traditional or folk song${cover}.`);
  if (hints.known_as === "hymn") lines.push(`The person adding it says it's a hymn, carol or worship song${cover}.`);
  if (hints.known_as === "show") lines.push("The person adding it says it's from a stage show or film.");
  if (hints.known_as === "recording" && artist) lines.push(`The person adding it knows it from ${artist}'s recording.`);
  if (hints.first_line) lines.push(`They say it starts: "${hints.first_line}" (from memory, may be inexact).`);
  if (hints.context?.length) lines.push(`It was added for an event tagged: ${hints.context.join(", ")}.`);
  if (hints.other_tune)
    lines.push(`These words are sung here to a different tune from the usual one${hints.tune ? ` (they call it "${hints.tune}")` : ""}; describe the words, not any one melody.`);
  return lines;
}

const norm = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// The remembered first line counts once printed words hold it: the recording's
// lyrics, or a hymnal's first line that begins with it.
export function confirmedFirstLine(hint: string | undefined, lyrics: string | null, hymnalFirstLines: string[]): string | null {
  const h = hint ? norm(hint) : "";
  if (h.length < 12) return null;
  if (lyrics && ` ${norm(lyrics)} `.includes(` ${h} `)) return hint!;
  return hymnalFirstLines.some((l) => ` ${norm(l)} `.startsWith(` ${h} `) || ` ${h} `.startsWith(` ${norm(l)} `)) ? hint! : null;
}

export type SpellingNote = { tone: "info" | "warning"; text: string };

// What the add form says about spelling under "Is this the song?". `artist_known`
// is the lookup's word that Spotify or our library knows the artist.
export function addSongSpellingNote(
  typedArtist: string,
  match: { artist: string | null; artist_known?: boolean; spotify_url: string | null; existing: unknown },
): SpellingNote | null {
  const typed = typedArtist.trim();
  if (!typed || isPlaceholderArtist(typed) || match.existing) return null;
  if (match.artist_known === false)
    return { tone: "warning", text: `We couldn't find “${typed}” on Spotify or in our library. Check the spelling before adding.` };
  if (match.artist && !isSameArtistName(match.artist, typed)) return { tone: "info", text: `You typed “${typed}”.` };
  if (match.artist_known && !match.spotify_url)
    return { tone: "warning", text: "We couldn't find this song on Spotify. Check the title's spelling before adding." };
  return null;
}
