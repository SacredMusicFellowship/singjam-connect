import { describe, expect, it } from "vitest";
import { browsePath, TAG_PATH_TYPE } from "./browsePaths";

describe("browsePath", () => {
  it("builds the address of each kind of browse page", () => {
    expect(browsePath("genre", "rock")).toBe("/genres/rock");
    expect(browsePath("community", "rising-song-hadar")).toBe("/communities/rising-song-hadar");
    expect(browsePath("person", "john-newton")).toBe("/people/john-newton");
    expect(browsePath("scripture", "psalms/90")).toBe("/scripture/psalms/90");
    expect(browsePath("scripture", "song-of-songs")).toBe("/scripture/song-of-songs");
    expect(browsePath("artist", "the-beatles")).toBe("/artists/the-beatles");
    expect(browsePath("show", "cinderella-1950")).toBe("/shows/cinderella-1950");
  });
  it("maps a path segment back to its tag type", () => {
    expect(TAG_PATH_TYPE.occasions).toBe("occasion");
    expect(TAG_PATH_TYPE.people).toBeUndefined();
  });
});

describe("browsePath traditional", () => {
  it("narrows a page to its traditional songs", () => {
    expect(browsePath("culture", "American", { traditional: true })).toBe("/cultures/American/traditional");
    expect(browsePath("culture", "american")).toBe("/cultures/american");
  });
});
