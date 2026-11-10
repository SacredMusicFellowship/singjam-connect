// Shared song-filter logic for the extended (facet) filters used by both the web
// repertoire/songs pages and the native songs/repertoire screens. Keeping the
// predicate and option derivation here guarantees web and native filter songs
// identically. UI concerns (URL sync, React state, "hide my songs") stay in the
// individual apps.

export type FilterableSong = {
  genres: string[];
  languages: string[];
  themes: string[];
  cultures: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
  // The last year a song's date can mean (song_filter_meta, migration 225): a
  // "16th c." text is 1501–1600. Missing means the same as `year`.
  year_max?: number | null;
};

export type SongFilterState = {
  genres: Set<string>;
  languages: Set<string>;
  themes: Set<string>;
  cultures: Set<string>;
  forms: Set<string>;
  occasions: Set<string>;
  communities: Set<string>;
  vibe: string;
  tonality: string;
  meter: string;
  yearMin: string;
  yearMax: string;
};

// The tag dimensions: a song passes when it has any selected tag of that type.
export const MULTI_FILTER_DIMS = ["genres", "forms", "occasions", "communities", "cultures", "languages", "themes"] as const;
export type MultiFilterDim = (typeof MULTI_FILTER_DIMS)[number];

export type FilterDim =
  | MultiFilterDim
  | "vibe"
  | "tonality"
  | "meter"
  | "year";

export type SongFilterOptions = {
  genres: string[];
  languages: string[];
  themes: string[];
  cultures: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  vibes: string[];
  tonalities: string[];
  meters: string[];
};

// Returns true if `song` passes every active filter. Pass `exclude` to ignore one
// dimension — used when deriving that dimension's option list so the facets cascade
// (each dimension's options come from songs passing the OTHER active filters).
export function songMatchesFilters(
  song: FilterableSong,
  f: SongFilterState,
  exclude?: FilterDim
): boolean {
  for (const dim of MULTI_FILTER_DIMS) {
    if (exclude !== dim && f[dim].size > 0 && !(song[dim] ?? []).some((x) => f[dim].has(x))) return false;
  }
  if (exclude !== "vibe" && f.vibe && song.vibe !== f.vibe) return false;
  if (exclude !== "tonality" && f.tonality && !song.tonality?.split(/,\s*/).includes(f.tonality)) return false;
  if (exclude !== "meter" && f.meter && song.meter !== f.meter) return false;
  if (exclude !== "year" && (f.yearMin || f.yearMax)) {
    // A song matches when its span overlaps the range asked for.
    if (song.year === null) return false;
    const last = song.year_max ?? song.year;
    if (f.yearMin && last < parseInt(f.yearMin, 10)) return false;
    if (f.yearMax && song.year > parseInt(f.yearMax, 10)) return false;
  }
  return true;
}

// Derives the available option list for every filter dimension. Each dimension is
// built from songs passing all OTHER active filters (so picking "Rock" trims the
// remaining facets to Rock songs). Currently-selected multi-select values are always
// included so their pills stay visible and deselectable even at zero matches.
export function deriveFilterOptions(
  songs: FilterableSong[],
  f: SongFilterState
): SongFilterOptions {
  const sortedUniq = (xs: string[]) => Array.from(new Set(xs)).sort();
  const forDim = (dim: FilterDim) => songs.filter((s) => songMatchesFilters(s, f, dim));
  const multi = (dim: MultiFilterDim) => sortedUniq([...forDim(dim).flatMap((s) => s[dim] ?? []), ...f[dim]]);
  return {
    genres: multi("genres"),
    languages: multi("languages"),
    themes: multi("themes"),
    cultures: multi("cultures"),
    forms: multi("forms"),
    occasions: multi("occasions"),
    communities: multi("communities"),
    vibes: sortedUniq(forDim("vibe").map((s) => s.vibe).filter(Boolean) as string[]),
    tonalities: sortedUniq(forDim("tonality").flatMap((s) => (s.tonality ? s.tonality.split(/,\s*/) : []))),
    meters: sortedUniq(forDim("meter").map((s) => s.meter).filter(Boolean) as string[]),
  };
}

// Counts how many filter dimensions are active. A year range (either bound) counts
// as one. Does not count app-specific toggles such as native's "hide my songs".
export function countActiveFilters(f: SongFilterState): number {
  return (
    MULTI_FILTER_DIMS.reduce((n, dim) => n + f[dim].size, 0) +
    (f.vibe ? 1 : 0) +
    (f.tonality ? 1 : 0) +
    (f.meter ? 1 : 0) +
    (f.yearMin || f.yearMax ? 1 : 0)
  );
}

// ── Tag hierarchy (migration 202) ────────────────────────────────────────────
// Tags nest through parent links, and a tag can have several parents (Rockabilly
// is under Rock and Americana). Picking a parent filters for it and everything
// below it, and its count covers them all.

export const FILTER_DIM_TAG_TYPE: Record<MultiFilterDim, string> = {
  genres: "genre",
  forms: "form",
  occasions: "occasion",
  communities: "community",
  cultures: "culture",
  languages: "language",
  themes: "theme",
};

export type TagGraphRow = { id: string; name: string; type: string; is_top_level?: boolean };
export type TagRelationRow = { tag_id: string; related_tag_id: string; kind: string };

// Per dimension: each tag name's direct children and parents, by name, and the
// tags shown at the top level even though they have a parent (Country, also under Americana).
export type TagHierarchy = Partial<Record<MultiFilterDim, { children: Map<string, string[]>; parents: Map<string, string[]>; topLevel: Set<string> }>>;

export function buildTagHierarchy(tags: TagGraphRow[], relations: TagRelationRow[]): TagHierarchy {
  const byId = new Map(tags.map((t) => [t.id, t]));
  const dimOf = new Map(Object.entries(FILTER_DIM_TAG_TYPE).map(([dim, type]) => [type, dim as MultiFilterDim]));
  const out: TagHierarchy = {};
  const entry = (dim: MultiFilterDim) => (out[dim] ??= { children: new Map(), parents: new Map(), topLevel: new Set() });
  for (const t of tags) {
    const dim = dimOf.get(t.type);
    if (dim && t.is_top_level) entry(dim).topLevel.add(t.name);
  }
  for (const r of relations) {
    if (r.kind !== "parent") continue;
    const child = byId.get(r.tag_id), parent = byId.get(r.related_tag_id);
    if (!child || !parent || child.type !== parent.type) continue;
    const dim = dimOf.get(child.type);
    if (!dim) continue;
    const h = entry(dim);
    h.children.set(parent.name, [...(h.children.get(parent.name) ?? []), child.name]);
    h.parents.set(child.name, [...(h.parents.get(child.name) ?? []), parent.name]);
  }
  return out;
}

// The options a filter section lists first: top-level tags, and any tag none of
// whose parents are on offer. The rest appear under their parents.
export function rootFacets(options: FacetOption[], dim: MultiFilterDim, h: TagHierarchy | null | undefined): FacetOption[] {
  const offered = new Set(options.map((o) => o.value));
  const entry = h?.[dim];
  return options.filter((o) => entry?.topLevel.has(o.value) || !(entry?.parents.get(o.value) ?? []).some((p) => offered.has(p)));
}

// A tag and everything below it.
export function tagWithDescendants(name: string, children: Map<string, string[]> | undefined): Set<string> {
  const out = new Set([name]);
  const stack = [name];
  while (stack.length) {
    const next = stack.pop()!;
    for (const c of children?.get(next) ?? []) if (!out.has(c)) { out.add(c); stack.push(c); }
  }
  return out;
}

function withAncestors(name: string, parents: Map<string, string[]> | undefined): Set<string> {
  const out = new Set([name]);
  const stack = [name];
  while (stack.length) {
    const next = stack.pop()!;
    for (const p of parents?.get(next) ?? []) if (!out.has(p)) { out.add(p); stack.push(p); }
  }
  return out;
}

// The state to actually filter with: every selected tag plus what's below it.
export function expandFilterState<F extends SongFilterState>(f: F, h: TagHierarchy | null | undefined): F {
  if (!h) return f;
  const out = { ...f };
  for (const dim of MULTI_FILTER_DIMS) {
    const children = h[dim]?.children;
    if (!children || f[dim].size === 0) continue;
    const expanded = new Set<string>();
    for (const v of f[dim]) for (const x of tagWithDescendants(v, children)) expanded.add(x);
    out[dim] = expanded;
  }
  return out;
}

export type FacetOption = { value: string; count: number };
export type SongFilterFacets = Record<MultiFilterDim, FacetOption[]>;

// Every tag a filter section can offer, with how many songs match it given the
// OTHER active filters. A parent counts the songs tagged with it or anything
// below it, and parents of used tags are offered even when no song carries them
// directly. Selected values always stay listed. Most songs first, then A–Z.
export function deriveFilterFacets(songs: FilterableSong[], f: SongFilterState, h?: TagHierarchy | null): SongFilterFacets {
  const expanded = expandFilterState(f, h);
  const out = {} as SongFilterFacets;
  for (const dim of MULTI_FILTER_DIMS) {
    const parents = h?.[dim]?.parents;
    const counts = new Map<string, number>();
    for (const s of songs) {
      if (!songMatchesFilters(s, expanded, dim)) continue;
      const hit = new Set<string>();
      for (const v of s[dim] ?? []) for (const a of withAncestors(v, parents)) hit.add(a);
      for (const v of hit) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    for (const v of f[dim]) if (!counts.has(v)) counts.set(v, 0);
    out[dim] = [...counts].map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
  }
  return out;
}

export type FacetOrder = "count" | "az";

// A filter section's options: most songs first (as faceted), or A–Z.
export function orderFacets(options: FacetOption[], order: FacetOrder): FacetOption[] {
  if (order === "count") return [...options].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  return [...options].sort((a, b) => a.value.localeCompare(b.value));
}
