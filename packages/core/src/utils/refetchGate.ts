// Coming back to a page fires several signals at once (the tab is shown, the
// page is restored, the live connection rejoins, the screen regains focus).
// A set page refetches once for all of them: the gate opens at most once
// every `minGapMs`.
export function createRefetchGate(minGapMs = 2000, now: () => number = Date.now): () => boolean {
  let last = -Infinity;
  return () => {
    const t = now();
    if (t - last < minGapMs) return false;
    last = t;
    return true;
  };
}

// Fresh set songs from the server, keeping any field a save is still settling
// (`isPending` is the save queue's) so a refetch can't undo the user's last tap.
// Rows added or removed elsewhere come and go; the list is in position order.
export function mergeRefetchedSetSongs<T extends { id: string; position: number; key_note: string | null; played: boolean; leader_user_ids: string[] | null }>(
  local: T[],
  server: T[],
  isPending: (key: string) => boolean,
): T[] {
  const byId = new Map(local.map((s) => [s.id, s]));
  return server
    .map((s) => {
      const l = byId.get(s.id);
      if (!l) return s;
      return {
        ...s,
        position: isPending("order") ? l.position : s.position,
        key_note: isPending(`key:${s.id}`) ? l.key_note : s.key_note,
        played: isPending(`played:${s.id}`) ? l.played : s.played,
        leader_user_ids: isPending(`leaders:${s.id}`) ? l.leader_user_ids : s.leader_user_ids ?? [],
      };
    })
    .sort((a, b) => a.position - b.position);
}
