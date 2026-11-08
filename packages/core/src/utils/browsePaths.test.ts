import { describe, expect, it } from "vitest";
import { browsePath, TAG_PATH_TYPE } from "./browsePaths";

describe("browsePath", () => {
  it("builds the address of each kind of browse page", () => {
    expect(browsePath("genre", "rock")).toBe("/genres/rock");
    expect(browsePath("community", "rising-song-hadar")).toBe("/communities/rising-song-hadar");
    expect(browsePath("person", "john-newton")).toBe("/people/john-newton");
    expect(browsePath("artist", "the-beatles")).toBe("/artists/the-beatles");
    expect(browsePath("show", "cinderella-1950")).toBe("/shows/cinderella-1950");
  });
  it("maps a path segment back to its tag type", () => {
    expect(TAG_PATH_TYPE.occasions).toBe("occasion");
    expect(TAG_PATH_TYPE.people).toBeUndefined();
  });
});
