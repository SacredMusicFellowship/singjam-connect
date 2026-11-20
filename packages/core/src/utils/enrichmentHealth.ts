// Whether the two research models are answering. Every enrichment run records
// which sources answered (song_enrichment_runs.checks); a model failing run
// after run means enrichment is quietly deciding on one model, as happened in
// November 2026 when Claude's schema grew too large.

export type RunChecks = { name: string; ok: boolean }[] | null | undefined;
export const WATCHED_SOURCES = ["GPT", "Claude"] as const;
export const OUTAGE_STREAK = 5;

const failed = (checks: RunChecks, name: string) => !!checks?.some((c) => c.name === name && !c.ok);

// The models whose failures, newest run first, have just reached the streak:
// so an outage is reported once, by the run that completes it.
export function newOutages(runs: RunChecks[], streak = OUTAGE_STREAK): string[] {
  return WATCHED_SOURCES.filter((name) => {
    const recent = runs.slice(0, streak);
    return recent.length === streak && recent.every((r) => failed(r, name)) && !failed(runs[streak], name);
  });
}

// How many of these runs each model failed in.
export function sourceFailures(runs: RunChecks[]): { name: string; failed: number }[] {
  return WATCHED_SOURCES.map((name) => ({ name, failed: runs.filter((r) => failed(r, name)).length })).filter((f) => f.failed > 0);
}
