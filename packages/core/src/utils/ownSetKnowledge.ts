export type SetKnowledge = { user_id: string; song_id: string; confidence: string; key_note: string | null };

const SHOWN = new Set(["lead", "support", "learn"]);

// The viewer's own part and key on a set's songs, from a fresh read of their
// songs, put in place of what the set has for them. Coming back from a song
// page this shows a new key at once, before the full page refresh lands.
// Only for a participant: a viewer who isn't one has no pills on the set.
export function mergeOwnKnowledge<K extends SetKnowledge>(
  knowledge: K[],
  userId: string,
  mine: readonly { song_id: string; confidence: string; key_note: string | null }[],
  setSongIds: ReadonlySet<string>,
  isParticipant: boolean,
): (K | SetKnowledge)[] {
  if (!isParticipant) return knowledge;
  const fresh = mine
    .filter((r) => setSongIds.has(r.song_id) && SHOWN.has(r.confidence))
    .map((r) => ({ user_id: userId, song_id: r.song_id, confidence: r.confidence, key_note: r.key_note }));
  return [...knowledge.filter((k) => k.user_id !== userId), ...fresh];
}
