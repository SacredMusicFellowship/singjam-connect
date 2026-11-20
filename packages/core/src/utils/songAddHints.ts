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
};

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

// A traditional song or a hymn isn't known by whoever recorded the version found
// on Spotify, so its card and page lead with its origin instead.
export function knownByRecordingFor(hints: SongAddHints | null): boolean | null {
  return hints?.known_as === "traditional" || hints?.known_as === "hymn" ? false : null;
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
