// The tags a jam update saves: tag_ids from the one tag picker, plus
// genre_ids/theme_ids from app builds that predate it, each once.
export function jamTagIdsFromBody(body: { tag_ids?: unknown; genre_ids?: unknown; theme_ids?: unknown }): string[] {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
  return [...new Set([...list(body.tag_ids), ...list(body.genre_ids), ...list(body.theme_ids)])];
}
