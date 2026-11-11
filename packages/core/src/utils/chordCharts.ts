// Chord charts come from Ultimate Guitar: a tab page on (tabs.)ultimate-guitar.com.
export function isUltimateGuitarChartUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  const host = url.hostname.toLowerCase();
  if (host !== "ultimate-guitar.com" && !host.endsWith(".ultimate-guitar.com")) return false;
  return url.pathname.length > 1;
}

export type ChartReviewer = { id: string; role: string | null };

// Song editors and admins review charts — never their own.
export function canReviewChart(reviewer: ChartReviewer, submittedBy: string | null): boolean {
  if (reviewer.role !== "admin" && reviewer.role !== "song_editor") return false;
  return !submittedBy || submittedBy !== reviewer.id;
}

// A new chart goes live (as unreviewed) unless the song already has an approved
// one — then it waits for review rather than replacing a good chart.
export function newChartGoesLive(song: { chord_chart_url: string | null; chord_chart_pending: boolean }): boolean {
  return !song.chord_chart_url || song.chord_chart_pending;
}
