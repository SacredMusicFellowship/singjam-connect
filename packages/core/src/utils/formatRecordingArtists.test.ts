import { describe, it, expect } from "vitest";
import { formatRecordingArtists, sortRecordingsByYear } from "./formatRecordingArtists";

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

describe("sortRecordingsByYear", () => {
  it("puts the earliest recording first and undated ones last, ties in editor order", () => {
    const sorted = sortRecordingsByYear([
      { name: "Jeff Buckley", year: 1994, position: 0 },
      { name: "Leonard Cohen", year: 1984, position: 1 },
      { name: "Unknown", year: null, position: 2 },
      { name: "Second 1994", year: 1994, position: 3 },
    ]);
    expect(sorted.map((r) => r.name)).toEqual(["Leonard Cohen", "Jeff Buckley", "Second 1994", "Unknown"]);
  });

  it("orders the formatted credits the same way", () => {
    expect(formatRecordingArtists([{ name: "Joe Cocker", year: 1968 }, { name: "Beatles", year: 1967 }], null)).toBe("Beatles (1967), Joe Cocker (1968)");
  });
});
