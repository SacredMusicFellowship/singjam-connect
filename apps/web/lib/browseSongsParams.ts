import type { SortBy } from "@/hooks/useSongFilters";

export type BrowseFilters = {
  genres: string[];
  languages: string[];
  themes: string[];
  cultures: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  vibe: string;
  tonality: string;
  meter: string;
  yearMin: string;
  yearMax: string;
  excludeMine: boolean;
  sort: SortBy;
};

export function browseRpcParams(f: BrowseFilters, offset: number, limit: number) {
  return {
    p_genres: f.genres.length > 0 ? f.genres : null,
    p_languages: f.languages.length > 0 ? f.languages : null,
    p_themes: f.themes.length > 0 ? f.themes : null,
    p_cultures: f.cultures.length > 0 ? f.cultures : null,
    p_forms: f.forms.length > 0 ? f.forms : null,
    p_occasions: f.occasions.length > 0 ? f.occasions : null,
    p_communities: f.communities.length > 0 ? f.communities : null,
    p_vibe: f.vibe || null,
    p_tonality: f.tonality || null,
    p_meter: f.meter || null,
    p_year_min: f.yearMin ? parseInt(f.yearMin, 10) : null,
    p_year_max: f.yearMax ? parseInt(f.yearMax, 10) : null,
    p_exclude_mine: f.excludeMine,
    p_sort: f.sort,
    p_offset: offset,
    p_limit: limit,
  };
}
