/**
 * The line under the avatars in an event's compact who's-going summary:
 * "Ada Lovelace, Chen Wei and 14 others". `total` counts heads, not names —
 * guests and the extra seats a buyer paid for are in it — so "others" agrees
 * with the full list's total.
 */
export function attendeeSummaryLine(names: string[], total: number): string {
  const named = names.slice(0, 2);
  const others = total - named.length;
  if (others <= 0) return named.join(" and ");
  return `${named.join(", ")} and ${others} ${others === 1 ? "other" : "others"}`;
}
