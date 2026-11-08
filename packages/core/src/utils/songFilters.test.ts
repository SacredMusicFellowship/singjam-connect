import { describe, it, expect } from "vitest";
import {
  songMatchesFilters,
  deriveFilterOptions,
  countActiveFilters,
  type FilterableSong,
  type SongFilterState,
} from "./songFilters";

function song(overrides: Partial<FilterableSong> = {}): FilterableSong {
  return {
    genres: [],
    languages: [],
    themes: [],
    cultures: [],
    forms: [],
    occasions: [],
    communities: [],
    vibe: null,
    tonality: null,
    meter: null,
    year: null,
    ...overrides,
  };
}

function emptyState(overrides: Partial<SongFilterState> = {}): SongFilterState {
  return {
    genres: new Set(),
    languages: new Set(),
    themes: new Set(),
    cultures: new Set(),
    forms: new Set(),
    occasions: new Set(),
    communities: new Set(),
    vibe: "",
    tonality: "",
    meter: "",
    yearMin: "",
    yearMax: "",
    ...overrides,
  };
}

describe("songMatchesFilters", () => {
  it("filters on forms, occasions and communities like the other tag dimensions", () => {
    const hymn = song({ forms: ["Hymn"], communities: ["Christian"], occasions: ["Funeral and memorial"] });
    expect(songMatchesFilters(hymn, emptyState({ forms: new Set(["Hymn", "Carol"]) }))).toBe(true);
    expect(songMatchesFilters(hymn, emptyState({ communities: new Set(["Jewish"]) }))).toBe(false);
    expect(songMatchesFilters(hymn, emptyState({ occasions: new Set(["Funeral and memorial"]), forms: new Set(["Hymn"]) }))).toBe(true);
  });

  it("passes a song when no filters are active", () => {
    expect(songMatchesFilters(song({ genres: ["Rock"] }), emptyState())).toBe(true);
  });

  it("matches multi-select dimensions with OR-within / AND-across semantics", () => {
    const rock = song({ genres: ["Rock"], languages: ["en"] });
    const state = emptyState({ genres: new Set(["Rock", "Jazz"]), languages: new Set(["en"]) });
    expect(songMatchesFilters(rock, state)).toBe(true);
    // song lacks a selected language → fails the AND across dimensions
    expect(songMatchesFilters(song({ genres: ["Rock"], languages: ["fr"] }), state)).toBe(false);
    // song lacks any selected genre
    expect(songMatchesFilters(song({ genres: ["Folk"], languages: ["en"] }), state)).toBe(false);
  });

  it("treats tonality as a comma-separated list", () => {
    const s = song({ tonality: "C major, A minor" });
    expect(songMatchesFilters(s, emptyState({ tonality: "A minor" }))).toBe(true);
    expect(songMatchesFilters(s, emptyState({ tonality: "G major" }))).toBe(false);
  });

  it("matches scalar vibe and meter exactly", () => {
    expect(songMatchesFilters(song({ vibe: "Calm" }), emptyState({ vibe: "Calm" }))).toBe(true);
    expect(songMatchesFilters(song({ vibe: "Calm" }), emptyState({ vibe: "Upbeat" }))).toBe(false);
    expect(songMatchesFilters(song({ meter: "4/4" }), emptyState({ meter: "3/4" }))).toBe(false);
  });

  it("applies year bounds and rejects songs with no year when a bound is set", () => {
    expect(songMatchesFilters(song({ year: 1990 }), emptyState({ yearMin: "1980", yearMax: "2000" }))).toBe(true);
    expect(songMatchesFilters(song({ year: 1970 }), emptyState({ yearMin: "1980" }))).toBe(false);
    expect(songMatchesFilters(song({ year: 2010 }), emptyState({ yearMax: "2000" }))).toBe(false);
    expect(songMatchesFilters(song({ year: null }), emptyState({ yearMin: "1980" }))).toBe(false);
    // no year bound set → a null-year song still passes
    expect(songMatchesFilters(song({ year: null }), emptyState())).toBe(true);
  });

  it("ignores the excluded dimension", () => {
    const s = song({ genres: ["Folk"], languages: ["en"] });
    const state = emptyState({ genres: new Set(["Rock"]), languages: new Set(["en"]) });
    expect(songMatchesFilters(s, state)).toBe(false);
    // excluding genres lets it through since language still matches
    expect(songMatchesFilters(s, state, "genres")).toBe(true);
  });
});

describe("deriveFilterOptions", () => {
  const songs: FilterableSong[] = [
    song({ genres: ["Rock"], languages: ["en"], tonality: "C major, A minor", vibe: "Upbeat", year: 1990 }),
    song({ genres: ["Jazz"], languages: ["fr"], tonality: "G major", vibe: "Calm", year: 2005 }),
    song({ genres: ["Rock"], languages: ["de"], vibe: "Calm", year: 2010 }),
  ];

  it("returns all options sorted and de-duplicated when nothing is selected", () => {
    const opts = deriveFilterOptions(songs, emptyState());
    expect(opts.genres).toEqual(["Jazz", "Rock"]);
    expect(opts.languages).toEqual(["de", "en", "fr"]);
    expect(opts.tonalities).toEqual(["A minor", "C major", "G major"]);
    expect(opts.vibes).toEqual(["Calm", "Upbeat"]);
  });

  it("cascades: selecting a genre trims the other dimensions to matching songs", () => {
    const opts = deriveFilterOptions(songs, emptyState({ genres: new Set(["Rock"]) }));
    // languages come from Rock songs only
    expect(opts.languages).toEqual(["de", "en"]);
    // but the genre list itself is NOT trimmed by its own selection
    expect(opts.genres).toEqual(["Jazz", "Rock"]);
  });

  it("keeps a selected multi-select value visible even when it matches no remaining songs", () => {
    // Select a language that no Jazz song has, then also select Jazz.
    const opts = deriveFilterOptions(
      songs,
      emptyState({ genres: new Set(["Jazz"]), languages: new Set(["en"]) })
    );
    expect(opts.languages).toContain("en");
  });
});

describe("countActiveFilters", () => {
  it("counts each multi-select value and each active scalar", () => {
    const state = emptyState({
      genres: new Set(["Rock", "Jazz"]),
      languages: new Set(["en"]),
      vibe: "Calm",
    });
    expect(countActiveFilters(state)).toBe(4);
  });

  it("counts a year range as a single filter regardless of which bounds are set", () => {
    expect(countActiveFilters(emptyState({ yearMin: "1980" }))).toBe(1);
    expect(countActiveFilters(emptyState({ yearMin: "1980", yearMax: "2000" }))).toBe(1);
    expect(countActiveFilters(emptyState())).toBe(0);
  });
});
