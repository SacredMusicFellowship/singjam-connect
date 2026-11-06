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
