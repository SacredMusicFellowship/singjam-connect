export type SongSubtitle = { kind: "production"; text: string } | { kind: "artist"; text: string } | null;

// The line under a song's title in lists (repertoire, set rows, set PDF): the
// show it's from when there is one, otherwise its artist. Song pages show
// production years instead and don't use this.
export function songSubtitle(productions: readonly string[] | null | undefined, displayArtist: string | null | undefined): SongSubtitle {
  const shows = (productions ?? []).filter(Boolean);
  if (shows.length) return { kind: "production", text: shows.join(", ") };
  const artist = displayArtist?.trim();
  return artist ? { kind: "artist", text: artist } : null;
}

// The same line as plain text, for places without italics (PDF, CSV).
export function songSubtitleText(productions: readonly string[] | null | undefined, displayArtist: string | null | undefined): string | null {
  const s = songSubtitle(productions, displayArtist);
  return s ? (s.kind === "production" ? `from ${s.text}` : s.text) : null;
}

// Whether the line under a song's title is its recording artists. byline()
// (migration 204) returns display_artist for a song known by its recording and
// its writers or tradition otherwise; rows from before 204 have no byline.
export function knownByRecording(byline: string | null | undefined, displayArtist: string | null | undefined): boolean {
  return byline === undefined || (byline ?? null) === (displayArtist?.trim() || null);
}

// The second line of a search card: the recordings for a song known by them;
// otherwise how the song is known, unless its writers already fill the title line.
export function songCardSecondLine(o: {
  byline?: string | null;
  displayArtist: string | null;
  hasWriters: boolean;
  recordingsLine: string | null;
}): string | null {
  if (knownByRecording(o.byline, o.displayArtist)) return o.recordingsLine;
  return o.hasWriters ? null : (o.byline ?? null);
}
