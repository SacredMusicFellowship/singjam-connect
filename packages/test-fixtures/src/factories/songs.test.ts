import { describe, expect, it } from "vitest";
import { songSlug } from "./songs";

describe("songSlug", () => {
  it("follows the database formula: title, then up to three writers A–Z", () => {
    expect(songSlug("Paper Boats", ["Iris Pemberley", "Ada Brightwater"])).toBe("paper-boats-ada-brightwater-iris-pemberley");
    expect(songSlug("Song", ["Dee", "cy", "Bea", "Al"])).toBe("song-al-bea-cy");
  });

  it("drops accents and punctuation and turns hyphens and slashes into spaces", () => {
    expect(songSlug("Café Rock-n-Roll / Reprise!", ["Zoë"])).toBe("cafe-rock-n-roll-reprise-zoe");
  });

  it("counts a writer once whatever the case", () => {
    expect(songSlug("Song", ["ada", "Ada"])).toBe("song-ada");
  });
});
