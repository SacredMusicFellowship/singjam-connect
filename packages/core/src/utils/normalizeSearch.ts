// Combining marks (Latin accents, Hebrew niqqud and cantillation, Arabic
// harakat), punctuation and control characters. Same ranges as the SQL
// search_normalize (migration 238); keep the two in step.
const STRIP =
  /[\u0001-\u001f\u0021-\u002f\u003a-\u0040\u005b-\u0060\u007b-\u009f\u00a1-\u00bf\u00d7\u00f7\u0300-\u036f\u0591-\u05c7\u05f3\u05f4\u0600-\u061f\u0640\u064b-\u065f\u066a-\u066d\u0670\u06d4\u06d6-\u06ed\u1ab0-\u1aff\u1dc0-\u1dff\u2010-\u205e\u20d0-\u20ff\u3001-\u303f\ufe20-\ufe2f]/gu;

/** Letters and digits in any script, plus spaces — matches the SQL search_normalize used by search_songs. */
export function normalizeSearch(s: string): string {
  return s.normalize("NFKD").toLowerCase().replace(STRIP, "");
}

/**
 * Returns true if every word in the query appears somewhere in the haystack.
 * Both are normalized before comparison, matching the SQL search_songs behaviour.
 */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = normalizeSearch(query.trim());
  if (!q) return true;
  const hay = normalizeSearch(haystack);
  return q.split(/\s+/).filter(Boolean).every((word) => hay.includes(word));
}
