// The song list sorts and their labels, one wording for every list in both apps.
// "Most known" orders by how many members know a song, as cards say "11 know it".
export type SongSortBy = "popularity" | "title_asc" | "title_desc";

export const SONG_SORT_LABEL: Record<SongSortBy, string> = {
  popularity: "Most known",
  title_asc: "A–Z",
  title_desc: "Z–A",
};

// A list's sort menu in its own order (your own songs start A–Z, the catalogue most known).
export function songSortOptions(order: SongSortBy[]): { value: SongSortBy; label: string }[] {
  return order.map((value) => ({ value, label: SONG_SORT_LABEL[value] }));
}
