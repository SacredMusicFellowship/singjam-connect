// How many pills fit on one line of a set song's Lead / Support / Learning row:
// about three on a phone, six on wider screens.
export const PEOPLE_ROW_LIMIT = { phone: 3, wide: 6 } as const;

/**
 * How many names to show in a row of `count` people when `limit` pills fit: all
 * of them if they fit, otherwise one fewer than the limit so "+ N more" takes
 * the last slot and the row stays on one line.
 */
export function shownPeopleCount(count: number, limit: number): number {
  return count <= limit ? count : Math.max(limit - 1, 1);
}

/**
 * Orders a row of people so the ones that matter stay visible when the row is
 * cut short: anyone in `first` (chosen leaders, then the viewer) keeps that
 * order at the front, everyone else keeps their original order after them.
 */
export function prioritizePeople<T extends { user_id: string }>(people: T[], first: (string | null | undefined)[]): T[] {
  const rank = new Map<string, number>();
  first.forEach((id, i) => { if (id && !rank.has(id)) rank.set(id, i); });
  return people
    .map((p, i) => ({ p, i, r: rank.get(p.user_id) ?? Infinity }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.p);
}
