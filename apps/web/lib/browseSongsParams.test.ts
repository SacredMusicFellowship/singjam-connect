import { describe, it, expect } from "vitest";
import { browseRpcParams, type BrowseFilters } from "./browseSongsParams";

const emptyFilters: BrowseFilters = {
  genres: [],
  languages: [],
  themes: [],
  cultures: [],
  forms: [],
  occasions: [],
  communities: [],
  vibe: "",
  tonality: "",
  meter: "",
  yearMin: "",
  yearMax: "",
  excludeMine: false,
  sort: "popularity",
};

describe("browseRpcParams", () => {
  it("maps empty filters to nulls so the RPC skips each dimension", () => {
    const params = browseRpcParams(emptyFilters, 0, 20);
    expect(params).toEqual({
      p_genres: null,
      p_languages: null,
      p_themes: null,
      p_cultures: null,
      p_forms: null,
      p_occasions: null,
      p_communities: null,
      p_vibe: null,
      p_tonality: null,
      p_meter: null,
      p_year_min: null,
      p_year_max: null,
      p_exclude_mine: false,
      p_sort: "popularity",
      p_offset: 0,
      p_limit: 20,
    });
  });

  it("passes selected tag arrays through", () => {
    const params = browseRpcParams(
      { ...emptyFilters, genres: ["Reggae", "Folk"], languages: ["English"] },
      0,
      20
    );
    expect(params.p_genres).toEqual(["Reggae", "Folk"]);
    expect(params.p_languages).toEqual(["English"]);
    expect(params.p_themes).toBeNull();
  });

  it("parses year bounds to integers", () => {
    const params = browseRpcParams({ ...emptyFilters, yearMin: "1960", yearMax: "1969" }, 0, 20);
    expect(params.p_year_min).toBe(1960);
    expect(params.p_year_max).toBe(1969);
  });

  it("passes single-value filters, exclude-mine, sort, and pagination", () => {
    const params = browseRpcParams(
      { ...emptyFilters, vibe: "Ballad", tonality: "Minor", meter: "3/4", excludeMine: true, sort: "title_desc" },
      40,
      20
    );
    expect(params.p_vibe).toBe("Ballad");
    expect(params.p_tonality).toBe("Minor");
    expect(params.p_meter).toBe("3/4");
    expect(params.p_exclude_mine).toBe(true);
    expect(params.p_sort).toBe("title_desc");
    expect(params.p_offset).toBe(40);
    expect(params.p_limit).toBe(20);
  });
});
