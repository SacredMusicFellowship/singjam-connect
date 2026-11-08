import { describe, expect, it } from "vitest";
import { songCardSecondLine, songSubtitle, songSubtitleText } from "./songSubtitle";

describe("songSubtitle", () => {
  it("names the show when the song is from one", () => {
    expect(songSubtitle(["The Wizard of Oz"], "Judy Garland")).toEqual({ kind: "production", text: "The Wizard of Oz" });
    expect(songSubtitle(["Pitch Perfect", "Glee"], null)).toEqual({ kind: "production", text: "Pitch Perfect, Glee" });
  });
  it("falls back to the artist", () => {
    expect(songSubtitle([], "The Beatles")).toEqual({ kind: "artist", text: "The Beatles" });
    expect(songSubtitle(undefined, "  Jolene Fan  ")).toEqual({ kind: "artist", text: "Jolene Fan" });
  });
  it("is empty when there's neither", () => {
    expect(songSubtitle([], null)).toBeNull();
    expect(songSubtitle([""], "  ")).toBeNull();
  });
  it("has a plain-text form", () => {
    expect(songSubtitleText(["Hamilton"], "Lin-Manuel Miranda")).toBe("from Hamilton");
    expect(songSubtitleText([], "Dolly Parton")).toBe("Dolly Parton");
    expect(songSubtitleText(null, null)).toBeNull();
  });
});

describe("songCardSecondLine", () => {
  const recordingsLine = "Isaac Zones (rec. 2015)";
  it("lists recordings for a song known by its recording, or a row from before byline existed", () => {
    expect(songCardSecondLine({ byline: "Van Morrison", displayArtist: "Van Morrison", hasWriters: true, recordingsLine })).toBe(recordingsLine);
    expect(songCardSecondLine({ displayArtist: "Van Morrison", hasWriters: true, recordingsLine })).toBe(recordingsLine);
  });
  it("shows how a traditional song is known instead of its recordings", () => {
    expect(songCardSecondLine({ byline: "Traditional · Jewish", displayArtist: "Isaac Zones", hasWriters: false, recordingsLine })).toBe("Traditional · Jewish");
  });
  it("shows nothing extra when the writers are already in the title line", () => {
    expect(songCardSecondLine({ byline: "John Newton", displayArtist: "Aretha Franklin, Elvis Presley", hasWriters: true, recordingsLine })).toBeNull();
  });
});
