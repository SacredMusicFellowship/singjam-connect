import { MUSICAL_KEYS } from "@singjam/core";
import type { FixtureContext } from "../context";
import type { Confidence, SongRow, UserSongRow } from "../types";

const CONFIDENCES: readonly Confidence[] = ["lead", "support", "support", "learn"];

// Gives a member `count` songs. `include` songs are always added first, which is how scenarios
// guarantee overlap between members (the friends page ranks matches by shared songs).
export function buildRepertoire(
  ctx: FixtureContext,
  userId: string,
  songs: readonly SongRow[],
  count: number,
  include: readonly SongRow[] = [],
): UserSongRow[] {
  const { rng } = ctx;
  const chosen = new Map<string, SongRow>();
  for (const song of include) chosen.set(song.id, song);
  for (const song of rng.sample(songs, songs.length)) {
    if (chosen.size >= count) break;
    chosen.set(song.id, song);
  }
  return [...chosen.values()].map((song) => ({
    user_id: userId,
    song_id: song.id,
    confidence: rng.pick(CONFIDENCES),
    key_note: rng.chance(0.3) ? rng.pick(MUSICAL_KEYS) : null,
  }));
}
