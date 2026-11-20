// A jam's set list: the name a new one gets, and the sets a host can pick from
// to link. Shared so web's JamSetList and native's jam screen offer the same.

export function jamSetListName(jamName: string | null | undefined): string {
  const name = jamName?.trim();
  return name ? `${name} — set list` : "Set list";
}

type SetRow = { id: string; name: string; short_code?: string | null; jam_id?: string | null; jam_name?: string | null };

export type LinkableSet = SetRow & { label: string; linkedElsewhere: boolean };

// The sets the user owns, then the ones they collaborate on, each labelled with
// the jam it already belongs to when that's a different jam.
export function linkableSets(owned: SetRow[], collaborating: SetRow[], jamId: string): LinkableSet[] {
  const seen = new Set<string>();
  return [...owned, ...collaborating]
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .map((s) => {
      const linkedElsewhere = !!s.jam_id && s.jam_id !== jamId;
      return {
        ...s,
        linkedElsewhere,
        label: linkedElsewhere ? `${s.name} (linked to ${s.jam_name ?? "another jam"})` : s.name,
      };
    });
}
