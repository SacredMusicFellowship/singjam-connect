import { describe, expect, it } from "vitest";
import { songCardCredits, songSubtitle, songSubtitleText } from "./songSubtitle";

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

describe("songCardCredits", () => {
  const recordingArtists = [{ name: "Isaac Zones", year: 2015 }];
  it("puts writers after the title and recordings under it for a song known by its recording", () => {
    const c = songCardCredits({ byline: "Van Morrison", displayArtist: "Van Morrison", composers: ["Van Morrison"], cultures: [], recordingArtists: [{ name: "Van Morrison", year: 1967 }] });
    expect(c.writers).toEqual([{ text: "V. Morrison", link: { kind: "person", name: "Van Morrison" } }]);
    expect(c.line).toEqual([{ text: "Van Morrison (1967)", link: { kind: "artist", name: "Van Morrison" } }]);
  });
  it("treats a row from before byline existed as known by its recording", () => {
    expect(songCardCredits({ displayArtist: "Van Morrison", composers: [], cultures: [], recordingArtists: null }).line).toEqual([{ text: "Van Morrison", link: null }]);
  });
  it("shows the writers under the title, each linked, for a song not known by its recording", () => {
    const c = songCardCredits({ byline: "John Newton, William Cowper", displayArtist: "Aretha Franklin", composers: ["John Newton"], cultures: [], recordingArtists });
    expect(c.writers).toEqual([]);
    expect(c.line).toEqual([
      { text: "John Newton", link: { kind: "person", name: "John Newton" } },
      { text: "William Cowper", link: { kind: "person", name: "William Cowper" } },
    ]);
  });
  it("shows a traditional byline whole and unlinked", () => {
    expect(songCardCredits({ byline: "Traditional · Jewish", displayArtist: "Isaac Zones", composers: ["Traditional"], cultures: [], recordingArtists }).line)
      .toEqual([{ text: "Traditional · Jewish", link: null }]);
  });
});
