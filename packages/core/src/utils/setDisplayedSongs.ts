import type { CardIdentity } from "./songSubtitle";

export type SharedSong = {
  song_id: string;
  slug: string;
  title: string;
  display_artist: string | null;
  viewer_has: boolean;
  viewer_leads: boolean;
  who_else: string[];
  who_else_leads: string[];
  in_set: boolean;
  popularity?: number;
  // What a song card shows (migration 218): line under the title, writers, cultures, recordings, identity.
  card?: {
    byline?: string | null;
    composers?: string[] | null;
    cultures?: string[] | null;
    recording_artists?: { name: string; year: number | null }[] | null;
    card_identity?: CardIdentity;
  } | null;
};

export type SortMode = "popular" | "alpha" | "za" | "leader";

export function displayedSongs(
  songs: SharedSong[],
  mode: SortMode,
  selectedLeaders: Set<string>,
  isSolo: boolean
): SharedSong[] {
  if (mode === "leader" && selectedLeaders.size > 0) {
    return [...songs]
      .filter((s) =>
        [...selectedLeaders].every((name) =>
          name === "You" ? s.viewer_leads : s.who_else_leads.includes(name)
        )
      )
      .sort((a, b) => a.title.localeCompare(b.title));
  }
  return [...songs].sort((a, b) => {
    if (mode === "alpha") return a.title.localeCompare(b.title);
    if (mode === "za") return b.title.localeCompare(a.title);
    if (isSolo) {
      const diff = (b.popularity ?? 0) - (a.popularity ?? 0);
      return diff !== 0 ? diff : a.title.localeCompare(b.title);
    }
    // Songs nobody else shares (who_else empty) always sort after shared
    // songs, regardless of popularity — they're the viewer's own repertoire
    // shown for completeness, not ranked against songs others know too.
    const aShared = a.who_else.length > 0;
    const bShared = b.who_else.length > 0;
    if (aShared !== bShared) return aShared ? -1 : 1;
    const aTotal = a.who_else.length + (a.viewer_has ? 1 : 0);
    const bTotal = b.who_else.length + (b.viewer_has ? 1 : 0);
    return bTotal !== aTotal ? bTotal - aTotal : a.title.localeCompare(b.title);
  });
}
