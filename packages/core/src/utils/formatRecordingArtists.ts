export type RecordingArtistCredit = { name: string; year: number | null };

// Earliest recording first; undated ones last; ties keep the editor's order
// (position when present, otherwise the order given — Array.sort is stable).
export function sortRecordingsByYear<T extends { year: number | null; position?: number | null }>(recordings: T[]): T[] {
  return [...recordings].sort(
    (a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || (a.position ?? Infinity) - (b.position ?? Infinity)
  );
}

// Older cached rows predate `recording_artists`, and a few songs have only the
// free-text display_artist, so both fall back to it without years.
export function formatRecordingArtists(
  artists: RecordingArtistCredit[] | null | undefined,
  fallback: string | null,
): string | null {
  if (!artists?.length) return fallback || null;
  return sortRecordingsByYear(artists).map((a) => (a.year ? `${a.name} (${a.year})` : a.name)).join(", ");
}
