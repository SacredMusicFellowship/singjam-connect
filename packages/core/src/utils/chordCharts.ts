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

// Scores (sheet music) come from a short list of sites, or a PDF anywhere.
// Song editors set them; members can't, so the list keeps out spam.
const SCORE_SITES: { host: string; name: string }[] = [
  { host: "dilbeyti.com", name: "Dil Beyti" },
  { host: "hymnary.org", name: "Hymnary" },
  { host: "imslp.org", name: "IMSLP" },
  { host: "cpdl.org", name: "CPDL" },
  { host: "musescore.com", name: "MuseScore" },
];

function httpUrl(raw: string): URL | null {
  try {
    const url = new URL(raw.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

const onHost = (host: string, site: string) => host === site || host.endsWith(`.${site}`);

// Where a score link goes, as a reader would name it: "Dil Beyti", "PDF", or
// null when it isn't a score link we accept.
export function scoreSiteName(raw: string): string | null {
  const url = httpUrl(raw);
  if (!url || url.pathname.length <= 1) return null;
  const host = url.hostname.toLowerCase();
  const site = SCORE_SITES.find((s) => onHost(host, s.host));
  if (site) return site.name;
  return url.pathname.toLowerCase().endsWith(".pdf") ? "PDF" : null;
}

export function isScoreUrl(raw: string): boolean {
  return scoreSiteName(raw) !== null;
}

// The one chart a row of song actions shows: chords when the song has them,
// otherwise its score. A song with both shows its score with its other links.
export type ChartLink = { kind: "chords" | "score"; url: string };

export function chartLink(chords: string | null | undefined, score: string | null | undefined): ChartLink | null {
  if (chords) return { kind: "chords", url: chords };
  if (score) return { kind: "score", url: score };
  return null;
}

export type ChartReviewer = { id: string; role: string | null };

// Admins review any chart, including their own; song editors review everyone else's.
export function canReviewChart(reviewer: ChartReviewer, submittedBy: string | null): boolean {
  if (reviewer.role === "admin") return true;
  if (reviewer.role !== "song_editor") return false;
  return !submittedBy || submittedBy !== reviewer.id;
}

// A new chart goes live (as unreviewed) unless the song already has an approved
// one — then it waits for review rather than replacing a good chart.
export function newChartGoesLive(song: { chord_chart_url: string | null; chord_chart_pending: boolean }): boolean {
  return !song.chord_chart_url || song.chord_chart_pending;
}

export type ChartQueueSort = "added" | "song" | "adder" | "reported";

export type ChartQueueRow = {
  id: string;
  createdAt: string;
  songTitle: string;
  adder: string | null;
  reportedAt: string | null;
};

// Where each sort starts: the oldest chart first (the queue's own order), names A–Z,
// and the most recently reported first.
export const CHART_QUEUE_DEFAULT_DIR: Record<ChartQueueSort, "asc" | "desc"> = {
  added: "asc",
  song: "asc",
  adder: "asc",
  reported: "desc",
};

const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

// Charts to review, sorted for the queue. Ties fall back to the oldest first, then id,
// so the order never shuffles. A chart with no recorded adder sorts last by adder either way.
export function sortChartQueue<T extends ChartQueueRow>(rows: T[], sort: ChartQueueSort, dir: "asc" | "desc"): T[] {
  const mul = dir === "asc" ? 1 : -1;
  const oldestFirst = (a: T, b: T) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (sort === "added") cmp = a.createdAt.localeCompare(b.createdAt) * mul;
    else if (sort === "song") cmp = byName(a.songTitle, b.songTitle) * mul;
    else if (sort === "adder") {
      if (!a.adder || !b.adder) cmp = (a.adder ? 0 : 1) - (b.adder ? 0 : 1);
      else cmp = byName(a.adder, b.adder) * mul;
    } else {
      cmp = ((a.reportedAt ? 1 : 0) - (b.reportedAt ? 1 : 0) || (a.reportedAt ?? "").localeCompare(b.reportedAt ?? "")) * mul;
    }
    return cmp || oldestFirst(a, b);
  });
}
