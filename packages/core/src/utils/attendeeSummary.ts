/**
 * The line under the avatars in an event's compact who's-going summary:
 * "Ada Lovelace, Chen Wei and 14 others". `total` counts heads, not names —
 * guests and the extra seats a buyer paid for are in it — so "others" agrees
 * with the full list's total.
 *
 * Returned in parts so the "14 others" can be rendered as a link to the full
 * list; `others` is null when everyone going is already named.
 */
export function attendeeSummaryParts(
  names: string[],
  total: number
): { named: string; others: string | null } {
  const shown = names.slice(0, 2);
  const rest = total - shown.length;
  if (rest <= 0) return { named: shown.join(" and "), others: null };
  return { named: shown.join(", "), others: `${rest} ${rest === 1 ? "other" : "others"}` };
}
