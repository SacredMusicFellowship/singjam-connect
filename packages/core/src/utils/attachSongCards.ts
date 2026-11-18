// Puts each song's card data (set_song_cards, migration 235) on a set's rows as
// songs.card. Fetch the cards alongside the rows: embedding the songs.card
// column per row costs ~9 ms a song (1.2 s for a 139-song set), and asking for
// cards after the rows adds a round trip. Without cards (an error), rows keep
// their byline fallback.
export function attachSongCards<T extends { song_id: string; songs: object | null }>(
  rows: T[],
  cards: readonly { song_id: string; card: unknown }[] | null | undefined,
): T[] {
  if (!cards?.length) return rows;
  const bySong = new Map(cards.map((c) => [c.song_id, c.card]));
  return rows.map((r) => (r.songs && bySong.has(r.song_id) ? { ...r, songs: { ...r.songs, card: bySong.get(r.song_id) } } : r));
}
