import { describe, it, expect } from "vitest";
import { formatRecordingArtists } from "./formatRecordingArtists";

describe("formatRecordingArtists", () => {
  it("follows each artist with their own recording year, in order", () => {
    expect(
      formatRecordingArtists(
        [
          { name: "Beatles", year: 1967 },
          { name: "Joe Cocker", year: 1968 },
        ],
        "Beatles, Joe Cocker",
      ),
    ).toBe("Beatles (1967), Joe Cocker (1968)");
  });

  it("leaves out a year that isn't known", () => {
    expect(
      formatRecordingArtists(
        [
          { name: "Gloria Gaynor", year: 1978 },
          { name: "CAKE", year: null },
        ],
        null,
      ),
    ).toBe("Gloria Gaynor (1978), CAKE");
  });

  it("falls back to the display artist when there are no recordings", () => {
    expect(formatRecordingArtists([], "Train")).toBe("Train");
    expect(formatRecordingArtists(undefined, "Train")).toBe("Train");
  });

  it("returns null when there is nothing to show", () => {
    expect(formatRecordingArtists(null, null)).toBeNull();
    expect(formatRecordingArtists([], "")).toBeNull();
  });
});
