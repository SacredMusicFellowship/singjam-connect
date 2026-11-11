export const ENRICHMENT_WAIT_MS = 2 * 60 * 1000;

// A song is "filling in" between the enrichment job starting and finishing —
// but never for more than two minutes, so a job that died doesn't leave the
// page waiting forever.
export function enrichmentInProgress(
  song: { enrichment_started_at?: string | null; enrichment_finished_at?: string | null },
  now: number = Date.now(),
): boolean {
  if (!song.enrichment_started_at) return false;
  const started = Date.parse(song.enrichment_started_at);
  if (Number.isNaN(started) || now - started > ENRICHMENT_WAIT_MS) return false;
  const finished = song.enrichment_finished_at ? Date.parse(song.enrichment_finished_at) : NaN;
  return Number.isNaN(finished) || finished < started;
}
