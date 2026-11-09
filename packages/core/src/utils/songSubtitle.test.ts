import { describe, expect, it } from "vitest";
import { songCardCredits, songCardIdentity, songSubtitle, songSubtitleText } from "./songSubtitle";

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

describe("songCardIdentity", () => {
  it("prefers the tune, then the scripture, then the first line, linking tune and text pages", () => {
    expect(songCardIdentity({ tune: "Nettleton", tune_slug: "nettleton", first_line: "Come, thou Fount" }, "Come Thou Fount"))
      .toEqual({ lead: "Tune: ", text: "Nettleton", link: { kind: "tune", key: "nettleton" } });
    expect(songCardIdentity({ source: { book: "Psalms", chapter_start: 133, verse_start: 1 }, text_slug: "hinei-ma-tov" }, "Hinei Ma Tov"))
      .toEqual({ text: "Psalm 133:1", link: { kind: "text", key: "hinei-ma-tov" } });
    expect(songCardIdentity({ first_line: "Oh Shenandoah, I long to see you," }, "Shenandoah"))
      .toEqual({ text: "“Oh Shenandoah, I long to see you…”", link: null });
  });
  it("skips a first line that only repeats the title", () => {
    expect(songCardIdentity({ first_line: "Come, thou Fount of every blessing," }, "Come Thou Fount of Every Blessing")).toBeNull();
    expect(songCardIdentity(null, "Anything")).toBeNull();
  });
});

describe("songCardCredits", () => {
  const recordingArtists = [{ name: "Isaac Zones", year: 2015 }];
  it("puts writers after the title and recordings under it for a song known by its recording", () => {
    const c = songCardCredits({ title: "Moondance", byline: "Van Morrison", displayArtist: "Van Morrison", composers: ["Van Morrison"], cultures: [], recordingArtists: [{ name: "Van Morrison", year: 1967 }] });
    expect(c.writers).toEqual([{ text: "V. Morrison", link: { kind: "person", key: "Van Morrison" } }]);
    expect(c.line).toEqual([{ text: "Van Morrison (1967)", link: { kind: "artist", key: "Van Morrison" } }]);
  });
  it("treats a row from before byline existed as known by its recording", () => {
    expect(songCardCredits({ title: "x", displayArtist: "Van Morrison", composers: [], cultures: [], recordingArtists: null }).line).toEqual([{ text: "Van Morrison", link: null }]);
  });
  it("leaves Traditional to the tune line when the song has a named tune", () => {
    const c = songCardCredits({ title: "Come Thou Fount of Every Blessing", byline: "Robert Robinson", displayArtist: "Sufjan Stevens", composers: ["Robert Robinson", "Traditional"], cultures: ["American", "English"], recordingArtists, identity: { tune: "Nettleton", tune_slug: "nettleton" } });
    expect(c.writers).toEqual([{ text: "R. Robinson", link: { kind: "person", key: "Robert Robinson" } }]);
    expect(c.line).toEqual([{ lead: "Tune: ", text: "Nettleton", link: { kind: "tune", key: "nettleton" } }]);
  });
  it("names one culture for a traditional song, linked to that culture's traditional songs", () => {
    const c = songCardCredits({ title: "Rio Grande", byline: "Traditional · English", displayArtist: null, composers: ["Traditional"], cultures: ["English", "American"], recordingArtists: [], identity: { first_line: "Oh, say were you ever in Rio Grande?" } });
    expect(c.writers).toEqual([{ text: "Trad. · English", link: { kind: "culture", key: "English", traditional: true } }]);
    expect(c.line).toEqual([{ text: "“Oh, say were you ever in Rio Grande…”", link: null }]);
  });
});
