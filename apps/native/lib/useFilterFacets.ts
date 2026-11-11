import { useMemo } from 'react';
import {
  countActiveFilters, deriveFilterFacets, deriveFilterOptions, expandFilterState,
  type FilterableSong, type SongFilterState,
} from '@singjam/core';
import { useTagHierarchy } from '@/lib/useTagHierarchy';

// What a filter sheet needs for a list of songs (web's useSongFilters): each
// dimension's options from songs passing the OTHER active filters, so one
// choice narrows the rest; selected tags expanded to the tags below them (Rock
// covers Classic Rock); and the year range. Pass the filter dimensions only
// (no sort), so re-sorting doesn't rebuild them.
export function useFilterFacets(songs: FilterableSong[], filters: SongFilterState) {
  const hierarchy = useTagHierarchy();
  const expanded = useMemo(() => expandFilterState(filters, hierarchy), [filters, hierarchy]);
  const options = useMemo(() => deriveFilterOptions(songs, expanded), [songs, expanded]);
  const facets = useMemo(() => deriveFilterFacets(songs, filters, hierarchy), [songs, filters, hierarchy]);
  const yearBounds = useMemo(() => {
    const years = songs.map(s => s.year).filter((y): y is number => y != null);
    return years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null };
  }, [songs]);
  return { hierarchy, expanded, options, facets, yearBounds, activeCount: countActiveFilters(filters) };
}
