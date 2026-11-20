import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countActiveFilters,
  deriveFilterFacets,
  deriveFilterOptions,
  expandFilterState,
  MULTI_FILTER_DIMS,
  songMatchesFilters,
  type FilterableSong,
  type MultiFilterDim,
  type SongFilterState,
  type TagHierarchy,
} from "@singjam/core";

export type SortBy = "popularity" | "title_asc" | "title_desc";
export type SelectedTags = Record<MultiFilterDim, Set<string>>;

// The URL parameter for each tag dimension (kept from before, so shared links still work).
const URL_PARAM: Record<MultiFilterDim, string> = {
  genres: "genre",
  forms: "form",
  occasions: "occasion",
  communities: "community",
  cultures: "culture",
  languages: "lang",
  themes: "theme",
};

function readUrlParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

function tagsFromUrl(): SelectedTags {
  const params = readUrlParams();
  return Object.fromEntries(MULTI_FILTER_DIMS.map((dim) => [dim, new Set(params.getAll(URL_PARAM[dim]))])) as SelectedTags;
}

const noTags = (): SelectedTags => Object.fromEntries(MULTI_FILTER_DIMS.map((dim) => [dim, new Set<string>()])) as SelectedTags;

export function useSongFilters<T extends FilterableSong>(
  songs: T[],
  initialSortBy: SortBy = "popularity",
  hierarchy: TagHierarchy | null = null,
  // Off for panels inside another page (a set's Add songs), which shouldn't touch its address.
  { syncUrl = true }: { syncUrl?: boolean } = {}
) {
  const fromUrl = (key: string) => (syncUrl ? readUrlParams().get(key) ?? "" : "");
  const [selectedTags, setSelectedTags] = useState<SelectedTags>(() => (syncUrl ? tagsFromUrl() : noTags()));
  const [selectedVibe, setSelectedVibe] = useState(() => fromUrl("vibe"));
  const [selectedTonality, setSelectedTonality] = useState(() => fromUrl("tonality"));
  const [selectedMeter, setSelectedMeter] = useState(() => fromUrl("meter"));
  const [yearMin, setYearMin] = useState(() => fromUrl("yrMin"));
  const [yearMax, setYearMax] = useState(() => fromUrl("yrMax"));
  const [sortBy, setSortBy] = useState<SortBy>(() => (fromUrl("sort") as SortBy) || initialSortBy);

  useEffect(() => {
    if (!syncUrl) return;
    const params = new URLSearchParams(window.location.search);
    [...Object.values(URL_PARAM), "vibe", "tonality", "meter", "sort", "yrMin", "yrMax"].forEach((k) => params.delete(k));
    for (const dim of MULTI_FILTER_DIMS) selectedTags[dim].forEach((v) => params.append(URL_PARAM[dim], v));
    if (selectedVibe) params.set("vibe", selectedVibe);
    if (selectedTonality) params.set("tonality", selectedTonality);
    if (selectedMeter) params.set("meter", selectedMeter);
    if (yearMin) params.set("yrMin", yearMin);
    if (yearMax) params.set("yrMax", yearMax);
    if (sortBy !== initialSortBy) params.set("sort", sortBy);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [syncUrl, selectedTags, selectedVibe, selectedTonality, selectedMeter, yearMin, yearMax, sortBy, initialSortBy]);

  const filterState = useMemo<SongFilterState>(() => ({
    ...selectedTags,
    vibe: selectedVibe,
    tonality: selectedTonality,
    meter: selectedMeter,
    yearMin,
    yearMax,
  }), [selectedTags, selectedVibe, selectedTonality, selectedMeter, yearMin, yearMax]);

  // What actually filters: each selected tag plus everything below it (Rock covers Classic Rock).
  const expandedState = useMemo(() => expandFilterState(filterState, hierarchy), [filterState, hierarchy]);

  const facets = useMemo(() => deriveFilterFacets(songs, filterState, hierarchy), [songs, filterState, hierarchy]);
  const filterOptions = useMemo(() => deriveFilterOptions(songs, expandedState), [songs, expandedState]);

  const yearBounds = useMemo(() => {
    const years = songs.map((s) => s.year).filter((y): y is number => y !== null);
    if (years.length === 0) return null;
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [songs]);

  const activeFilterCount = countActiveFilters(filterState);

  const matchesFilters = useCallback(
    (song: FilterableSong | undefined): boolean => (song ? songMatchesFilters(song, expandedState) : true),
    [expandedState]
  );

  const toggleTag = useCallback((dim: MultiFilterDim, value: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev[dim]);
      next.has(value) ? next.delete(value) : next.add(value);
      return { ...prev, [dim]: next };
    });
  }, []);

  function clearFilters() {
    setSelectedTags(noTags());
    setSelectedVibe("");
    setSelectedTonality("");
    setSelectedMeter("");
    setYearMin("");
    setYearMax("");
  }

  return {
    selectedTags, toggleTag,
    selectedVibe, setSelectedVibe,
    selectedTonality, setSelectedTonality,
    selectedMeter, setSelectedMeter,
    yearMin, setYearMin,
    yearMax, setYearMax,
    yearBounds,
    activeFilterCount,
    expandedState,
    facets,
    filterOptions,
    matchesFilters,
    clearFilters,
    sortBy, setSortBy,
  };
}

export type SongFilters = ReturnType<typeof useSongFilters>;
