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
    if (song.year === null) return false;
    if (f.yearMin && song.year < parseInt(f.yearMin, 10)) return false;
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
