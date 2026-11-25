// The keys offered for a set song's key and a member's own key for a song.
export const MUSICAL_KEYS = ["A", "Bb", "B", "C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "G#", "Ab"] as const;

export function isMusicalKey(value: unknown): value is (typeof MUSICAL_KEYS)[number] {
  return typeof value === "string" && (MUSICAL_KEYS as readonly string[]).includes(value);
}

// The mode a member's key is shown with, from the song's tonality: three letters
// on a phone ("A min", "G maj", "C Dor"), the full word with more room ("A minor").
// Only a song with one major, minor or modal tonality gets one; scales like
// Pentatonic or Blues, or a mix, show the key alone.
// Harmonic and melodic minor are still a minor key to the singer.
const KEY_MODES: Record<string, { short: string; full: string }> = {
  major: { short: "maj", full: "major" },
  ionian: { short: "maj", full: "major" },
  minor: { short: "min", full: "minor" },
  aeolian: { short: "min", full: "minor" },
  "harmonic minor": { short: "min", full: "minor" },
  "melodic minor": { short: "min", full: "minor" },
  dorian: { short: "Dor", full: "Dorian" },
  phrygian: { short: "Phr", full: "Phrygian" },
  lydian: { short: "Lyd", full: "Lydian" },
  mixolydian: { short: "Mix", full: "Mixolydian" },
  locrian: { short: "Loc", full: "Locrian" },
};

export type KeyMode = { short: string; full: string };

// Every mode a key can show with, for sizing a key pill to the widest of them.
export const KEY_MODE_OPTIONS: KeyMode[] = [...new Map(Object.values(KEY_MODES).map((m) => [m.full, m])).values()];

export function keyMode(tonality: string | null | undefined): KeyMode | null {
  const values = (tonality ?? "").split(",").map((v) => v.trim().toLowerCase()).filter(Boolean);
  return values.length === 1 ? KEY_MODES[values[0]] ?? null : null;
}

export function keyWithMode(key: string, mode: KeyMode | null, length: "short" | "full"): string {
  if (!mode) return key;
  return `${key} ${length === "short" ? mode.short : mode.full}`;
}

// A chosen key (the set's key, or your own) looks the same everywhere: violet,
// which no confidence level, Played (green) or "add this song" (indigo) uses.
// An unset key stays a neutral outline pill. Tailwind classes, read by both apps.
export const KEY_STYLE = {
  chip: "border border-violet-200 bg-violet-50",
  text: "text-violet-800",
  emptyChip: "border border-zinc-200 bg-white",
  emptyText: "text-zinc-500",
} as const;

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
