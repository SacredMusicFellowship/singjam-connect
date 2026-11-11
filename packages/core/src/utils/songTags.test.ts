import { describe, expect, it } from "vitest";
import { jamTags, songTagNames, songTraditionTag, type SongTagRow } from "./songTags";

const rows: SongTagRow[] = [
  { context: "general", tags: { name: "Rock", type: "genre" } },
  { context: "general", tags: { name: "Folk Rock", type: "genre" } },
  { context: "general", tags: { name: "English", type: "culture" } },
  { context: "music", tags: { name: "English", type: "culture" } },
  { context: "lyrics", tags: { name: "Irish", type: "culture" } },
  { context: "general", tags: { name: "Jewish", type: "community" } },
  { context: null, tags: { name: "Hymn", type: "form" } },
  { context: "general", tags: null },
];

describe("songTagNames", () => {
  it("returns one type's names A–Z, each once, across contexts by default", () => {
    expect(songTagNames(rows, "genre")).toEqual(["Folk Rock", "Rock"]);
    expect(songTagNames(rows, "culture")).toEqual(["English", "Irish"]);
  });

  it("narrows to one context, treating a missing context as general", () => {
    expect(songTagNames(rows, "culture", "general")).toEqual(["English"]);
    expect(songTagNames(rows, "culture", "lyrics")).toEqual(["Irish"]);
    expect(songTagNames(rows, "form", "general")).toEqual(["Hymn"]);
  });

  it("handles no rows", () => {
    expect(songTagNames(undefined, "genre")).toEqual([]);
    expect(songTagNames(rows, "occasion")).toEqual([]);
  });
});

describe("songTraditionTag", () => {
  it("finds where the melody and words come from", () => {
    expect(songTraditionTag(rows, "music")).toEqual({ name: "English", type: "culture" });
    expect(songTraditionTag(rows, "lyrics")).toEqual({ name: "Irish", type: "culture" });
    expect(songTraditionTag([], "music")).toBeNull();
  });
});

describe("jamTags", () => {
  it("returns a jam's tags A–Z, optionally of one type", () => {
    const jam = [
      { tags: { id: "2", name: "Shabbat", type: "occasion" } },
      { tags: { id: "1", name: "Folk", type: "genre" } },
      { tags: null },
    ];
    expect(jamTags(jam).map((t) => t.name)).toEqual(["Folk", "Shabbat"]);
    expect(jamTags(jam, "genre").map((t) => t.id)).toEqual(["1"]);
  });
});
