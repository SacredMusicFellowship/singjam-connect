import { describe, it, expect } from "vitest";
import { properSongTitle, titleCase } from "./songTitleCase";

describe("titleCase", () => {
  it("capitalises words but not small ones in the middle", () => {
    expect(titleCase("canticle of the turning")).toBe("Canticle of the Turning");
    expect(titleCase("the wind and the rain")).toBe("The Wind and the Rain");
    expect(titleCase("here we come a-wassailing")).toBe("Here We Come A-Wassailing");
    expect(titleCase("what a friend we have in jesus")).toBe("What a Friend We Have in Jesus");
    expect(titleCase("AMAZING GRACE")).toBe("Amazing Grace");
  });
});

describe("properSongTitle", () => {
  it("takes the casing of a source that prints the same title", () => {
    expect(properSongTitle("canticle of the turning", [null, "Canticle of the Turning"])).toBe("Canticle of the Turning");
    expect(properSongTitle("jolene", ["Jolene (song)"])).toBe("Jolene");
  });
  it("ignores a source with a different title and falls back to title case", () => {
    expect(properSongTitle("be thou my vision", ["Slane"])).toBe("Be Thou My Vision");
  });
  it("keeps a title typed with mixed case", () => {
    expect(properSongTitle("Ain't No Sunshine", ["ain't no sunshine"])).toBe("Ain't No Sunshine");
    expect(properSongTitle("iPhone song")).toBe("iPhone song");
  });
  it("keeps a one-word title in capitals (an acronym)", () => {
    expect(properSongTitle("YMCA")).toBe("YMCA");
  });
});
