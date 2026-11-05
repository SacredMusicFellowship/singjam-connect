export type RecordingArtistCredit = { name: string; year: number | null };

// Older cached rows predate `recording_artists`, and a few songs have only the
// free-text display_artist, so both fall back to it without years.
export function formatRecordingArtists(
  artists: RecordingArtistCredit[] | null | undefined,
  fallback: string | null,
): string | null {
  if (!artists?.length) return fallback || null;
  return artists.map((a) => (a.year ? `${a.name} (${a.year})` : a.name)).join(", ");
}
