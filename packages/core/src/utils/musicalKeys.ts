// The keys offered for a set song's key and a member's own key for a song.
export const MUSICAL_KEYS = ["A", "Bb", "B", "C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab"] as const;

export function isMusicalKey(value: unknown): value is (typeof MUSICAL_KEYS)[number] {
  return typeof value === "string" && (MUSICAL_KEYS as readonly string[]).includes(value);
}

export const SET_SONG_NOTE_MAX = 200;

// A member's private notes on a song (user_song_notes, migration 178).
export const PERSONAL_SONG_NOTES_MAX = 2000;

// Trims a set song's note; blank becomes null. Returns undefined when the input
// isn't a string or null, or is longer than SET_SONG_NOTE_MAX.
export function normalizeSetSongNote(value: unknown): string | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed.length > SET_SONG_NOTE_MAX) return undefined;
  return trimmed || null;
}

// The set key to switch to when a song's leaders change: the personal key of
// the first newly selected leader who has one. Undefined means leave the set
// key alone (a leader was removed, or no new leader has a key).
export function keyForNewLeaders(
  previousLeaderIds: string[],
  nextLeaderIds: string[],
  personalKeys: Map<string, string>,
): string | undefined {
  for (const id of nextLeaderIds) {
    if (previousLeaderIds.includes(id)) continue;
    const key = personalKeys.get(id);
    if (key) return key;
  }
  return undefined;
}
