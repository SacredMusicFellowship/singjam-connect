import { describe, expect, it } from "vitest";
import { SONG_SORT_LABEL, songSortOptions } from "./songSort";

describe("songSortOptions", () => {
  it("labels each sort the same way, in the order asked for", () => {
    expect(songSortOptions(["title_asc", "title_desc", "popularity"])).toEqual([
      { value: "title_asc", label: "A–Z" },
      { value: "title_desc", label: "Z–A" },
      { value: "popularity", label: "Most known" },
    ]);
    expect(SONG_SORT_LABEL.popularity).toBe("Most known");
  });
});
