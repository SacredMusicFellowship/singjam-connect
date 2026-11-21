const songs = (n: number) => `${n} song${n === 1 ? "" : "s"}`;

// The Song Library's result count. `loaded` rows came back of `total` matches
// (search_songs total_count); `shown` is what's left after filters.
export function searchCountLabel({ shown, loaded, total }: { shown: number; loaded: number; total: number }): string {
  if (loaded < total) return `Showing ${shown} of ${songs(total)}`;
  return shown < loaded ? `${songs(shown)} (${loaded} before filters)` : songs(shown);
}
