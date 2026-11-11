// The jams list loads everything from the last 90 days up front; past events
// older than that are fetched a page at a time on request.
export const PAST_JAMS_WINDOW_DAYS = 90;
export const OLDER_PAST_JAMS_PAGE = 10;

export function pastJamsWindowStart(now: Date = new Date()): string {
  return new Date(now.getTime() - PAST_JAMS_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// Which past jams appear under "Past events": every official event, plus, for a
// signed-in user, jams they hosted, RSVP'd to (any status), or answered an
// invite to. Returned as a PostgREST `or` filter so older pages can be fetched
// already filtered.
export function pastJamsOrFilter(
  userId: string | null,
  rsvps: { jam_id: string }[],
  invites: { jam_id: string; status: string }[],
): string {
  const clauses = ["visibility.eq.official"];
  if (!userId) return clauses.join(",");
  clauses.push(`host_user_id.eq.${userId}`);
  const ids = new Set([
    ...rsvps.map((r) => r.jam_id),
    ...invites.filter((i) => i.status === "accepted" || i.status === "declined").map((i) => i.jam_id),
  ]);
  if (ids.size > 0) clauses.push(`id.in.(${[...ids].join(",")})`);
  return clauses.join(",");
}
