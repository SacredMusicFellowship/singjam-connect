import { useCallback, useEffect, useMemo, useState } from "react";
import {
  countActiveFilters,
  deriveFilterOptions,
  songMatchesFilters,
  type FilterableSong,
  type SongFilterState,
} from "@singjam/core";

export type SortBy = "popularity" | "title_asc" | "title_desc";

function readUrlParams() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

export function useSongFilters<T extends FilterableSong>(
  songs: T[],
  initialSortBy: SortBy = "popularity"
) {
  const [selectedGenres, setSelectedGenres] = useState<Set<string>>(() => new Set(readUrlParams().getAll("genre")));
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(() => new Set(readUrlParams().getAll("lang")));
  const [selectedThemes, setSelectedThemes] = useState<Set<string>>(() => new Set(readUrlParams().getAll("theme")));
  const [selectedCultures, setSelectedCultures] = useState<Set<string>>(() => new Set(readUrlParams().getAll("culture")));
  const [selectedForms, setSelectedForms] = useState<Set<string>>(() => new Set(readUrlParams().getAll("form")));
  const [selectedOccasions, setSelectedOccasions] = useState<Set<string>>(() => new Set(readUrlParams().getAll("occasion")));
  const [selectedCommunities, setSelectedCommunities] = useState<Set<string>>(() => new Set(readUrlParams().getAll("community")));
  const [selectedVibe, setSelectedVibe] = useState(() => readUrlParams().get("vibe") ?? "");
  const [selectedTonality, setSelectedTonality] = useState(() => readUrlParams().get("tonality") ?? "");
  const [selectedMeter, setSelectedMeter] = useState(() => readUrlParams().get("meter") ?? "");
  const [yearMin, setYearMin] = useState(() => readUrlParams().get("yrMin") ?? "");
  const [yearMax, setYearMax] = useState(() => readUrlParams().get("yrMax") ?? "");
  const [sortBy, setSortBy] = useState<SortBy>(() => (readUrlParams().get("sort") as SortBy | null) ?? initialSortBy);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    ["genre", "lang", "theme", "culture", "form", "occasion", "community", "vibe", "tonality", "meter", "sort", "yrMin", "yrMax"].forEach((k) => params.delete(k));
    selectedGenres.forEach((g) => params.append("genre", g));
    selectedLanguages.forEach((l) => params.append("lang", l));
    selectedThemes.forEach((t) => params.append("theme", t));
    selectedCultures.forEach((c) => params.append("culture", c));
    selectedForms.forEach((f) => params.append("form", f));
    selectedOccasions.forEach((o) => params.append("occasion", o));
    selectedCommunities.forEach((c) => params.append("community", c));
    if (selectedVibe) params.set("vibe", selectedVibe);
    if (selectedTonality) params.set("tonality", selectedTonality);
    if (selectedMeter) params.set("meter", selectedMeter);
    if (yearMin) params.set("yrMin", yearMin);
    if (yearMax) params.set("yrMax", yearMax);
    if (sortBy !== initialSortBy) params.set("sort", sortBy);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [selectedGenres, selectedLanguages, selectedThemes, selectedCultures, selectedForms, selectedOccasions, selectedCommunities, selectedVibe, selectedTonality, selectedMeter, yearMin, yearMax, sortBy, initialSortBy]);

  const filterState = useMemo<SongFilterState>(() => ({
    genres: selectedGenres,
    languages: selectedLanguages,
    themes: selectedThemes,
    cultures: selectedCultures,
    forms: selectedForms,
    occasions: selectedOccasions,
    communities: selectedCommunities,
    vibe: selectedVibe,
    tonality: selectedTonality,
    meter: selectedMeter,
    yearMin,
    yearMax,
  }), [selectedGenres, selectedLanguages, selectedThemes, selectedCultures, selectedForms, selectedOccasions, selectedCommunities, selectedVibe, selectedTonality, selectedMeter, yearMin, yearMax]);

  const filterOptions = useMemo(() => deriveFilterOptions(songs, filterState), [songs, filterState]);

  const yearBounds = useMemo(() => {
    const years = songs.map((s) => s.year).filter((y): y is number => y !== null);
    if (years.length === 0) return null;
    return { min: Math.min(...years), max: Math.max(...years) };
  }, [songs]);

  const activeFilterCount = countActiveFilters(filterState);

  const matchesFilters = useCallback(
    (song: FilterableSong | undefined): boolean => (song ? songMatchesFilters(song, filterState) : true),
    [filterState]
  );

  function toggleGenre(g: string) {
    setSelectedGenres((prev) => { const next = new Set(prev); next.has(g) ? next.delete(g) : next.add(g); return next; });
  }
  function toggleLanguage(l: string) {
    setSelectedLanguages((prev) => { const next = new Set(prev); next.has(l) ? next.delete(l) : next.add(l); return next; });
  }
  function toggleTheme(t: string) {
    setSelectedThemes((prev) => { const next = new Set(prev); next.has(t) ? next.delete(t) : next.add(t); return next; });
  }
  function toggleCulture(c: string) {
    setSelectedCultures((prev) => { const next = new Set(prev); next.has(c) ? next.delete(c) : next.add(c); return next; });
  }
  const toggleIn = (set: (f: (prev: Set<string>) => Set<string>) => void) => (v: string) =>
    set((prev) => { const next = new Set(prev); next.has(v) ? next.delete(v) : next.add(v); return next; });
  const toggleForm = toggleIn(setSelectedForms);
  const toggleOccasion = toggleIn(setSelectedOccasions);
  const toggleCommunity = toggleIn(setSelectedCommunities);
  function clearFilters() {
    setSelectedGenres(new Set());
    setSelectedLanguages(new Set());
    setSelectedThemes(new Set());
    setSelectedCultures(new Set());
    setSelectedForms(new Set());
    setSelectedOccasions(new Set());
    setSelectedCommunities(new Set());
    setSelectedVibe("");
    setSelectedTonality("");
    setSelectedMeter("");
    setYearMin("");
    setYearMax("");
  }

  return {
    selectedGenres, selectedLanguages, selectedThemes, selectedCultures,
    selectedForms, selectedOccasions, selectedCommunities,
    selectedVibe, setSelectedVibe,
    selectedTonality, setSelectedTonality,
    selectedMeter, setSelectedMeter,
    yearMin, setYearMin,
    yearMax, setYearMax,
    yearBounds,
    activeFilterCount,
    filterOptions,
    matchesFilters,
    toggleGenre, toggleLanguage, toggleTheme, toggleCulture, toggleForm, toggleOccasion, toggleCommunity, clearFilters,
    sortBy, setSortBy,
  };
}
