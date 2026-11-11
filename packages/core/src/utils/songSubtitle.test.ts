import { describe, expect, it } from "vitest";
import { bylineCredits, songCardCredits, songCardIdentity, songRowText, traditionalCredit, songSubtitle, songSubtitleText } from "./songSubtitle";

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
  it("prefers the tune, then the scripture, then the first line, linking tune, scripture and text pages", () => {
    expect(songCardIdentity({ tune: "Nettleton", tune_slug: "nettleton", first_line: "Come, thou Fount" }, "Come Thou Fount"))
      .toEqual({ lead: "Tune: ", text: "Nettleton", link: { kind: "tune", key: "nettleton" } });
    expect(songCardIdentity({ source: { book: "Psalms", chapter_start: 133, verse_start: 1 }, text_slug: "hinei-ma-tov" }, "Hinei Ma Tov"))
      .toEqual({ text: "Psalm 133:1", link: { kind: "scripture", key: "psalms/133" } });
    expect(songCardIdentity({ source: { book: "Psalms", chapter_start: 90, verse_start: null, relation: "metrical" }, text_slug: "o-god" }, "O God, Our Help"))
      .toEqual({ text: "After Psalm 90", link: { kind: "scripture", key: "psalms/90" } });
    expect(songCardIdentity({ source: { book: null, chapter_start: null, verse_start: null, citation: "Amidah; Kaddish" }, text_slug: "oseh-shalom" }, "Oseh Shalom"))
      .toEqual({ text: "Amidah; Kaddish", link: { kind: "text", key: "oseh-shalom" } });
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
    expect(c.line).toEqual([{ text: "Van Morrison", suffix: " (1967)", link: { kind: "artist", key: "Van Morrison" } }]);
  });
  it("lets an explicit known-by-recording choice override the byline either way", () => {
    const base = { title: "Amazing Grace", byline: "Judy Collins", displayArtist: "Judy Collins", composers: ["John Newton"], cultures: [], recordingArtists: [{ name: "Judy Collins", year: 1970 }], identity: { tune: "New Britain", tune_slug: "new-britain" } };
    expect(songCardCredits({ ...base, knownByRecording: false }).line).toEqual([{ lead: "Tune: ", text: "New Britain", link: { kind: "tune", key: "new-britain" } }]);
    expect(songCardCredits({ ...base, byline: "John Newton", knownByRecording: true }).line).toEqual([{ text: "Judy Collins", suffix: " (1970)", link: { kind: "artist", key: "Judy Collins" } }]);
    expect(songCardCredits({ ...base, byline: "John Newton", knownByRecording: null }).line[0].text).toBe("New Britain");
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
  describe("a chosen card line", () => {
    const base = {
      title: "This Land Is Your Land", byline: "Woody Guthrie", displayArtist: "Woody Guthrie", composers: ["Woody Guthrie", "Traditional"], cultures: ["American"],
      recordingArtists: [{ name: "Woody Guthrie", year: 1944 }],
      identity: { tune: "Old Hymn", tune_slug: "old-hymn", source: null, first_line: "As I was walking that ribbon of highway" },
    };
    it("shows the recordings, overriding the byline", () => {
      expect(songCardCredits({ ...base, cardLine: "recordings" }).line.map((c) => c.text)).toEqual(["Woody Guthrie"]);
    });
    it("moves the writers in full under the title, Traditional with its culture", () => {
      const c = songCardCredits({ ...base, cardLine: "writers" });
      expect(c.writers).toEqual([]);
      expect(c.line).toEqual([
        { text: "Traditional · American", link: { kind: "culture", key: "American", traditional: true } },
        { text: "Woody Guthrie", link: { kind: "person", key: "Woody Guthrie" } },
      ]);
    });
    it("shows only the chosen one of tune, scripture and first line, or nothing", () => {
      expect(songCardCredits({ ...base, cardLine: "tune" }).line[0].text).toBe("Old Hymn");
      expect(songCardCredits({ ...base, cardLine: "first_line" }).line[0].text).toBe("“As I was walking that ribbon of highway…”");
      expect(songCardCredits({ ...base, cardLine: "scripture" }).line).toEqual([]);
      expect(songCardCredits({ ...base, cardLine: "none" }).line).toEqual([]);
    });
    it("reads the saved choice from the card identity, and an explicit null means automatic", () => {
      expect(songCardCredits({ ...base, identity: { ...base.identity, line: "first_line" } }).line[0].text).toBe("“As I was walking that ribbon of highway…”");
      expect(songCardCredits({ ...base, identity: { ...base.identity, line: "first_line" }, cardLine: null, knownByRecording: true }).line[0].text).toBe("Woody Guthrie");
    });
  });
});

describe("bylineCredits", () => {
  it("links each writer or artist named in the line, keeping names with commas whole", () => {
    expect(bylineCredits("Peter, Paul and Mary", { people: [], artists: ["Peter, Paul and Mary"] }))
      .toEqual([{ text: "Peter, Paul and Mary", link: { kind: "artist", key: "Peter, Paul and Mary" } }]);
    expect(bylineCredits("John Newton, William Cowper", { people: ["William Cowper", "John Newton"], artists: [] })).toEqual([
      { text: "John Newton", link: { kind: "person", key: "John Newton" } },
      { text: ", ", link: null },
      { text: "William Cowper", link: { kind: "person", key: "William Cowper" } },
    ]);
  });
  it("leaves unknown names plain", () => {
    expect(bylineCredits("Some Choir", { people: [], artists: [] })).toEqual([{ text: "Some Choir", link: null }]);
  });
  it("links a traditional line to that culture's traditional songs, or to all of them", () => {
    expect(bylineCredits("Traditional · Irish", { people: ["Traditional"], artists: [] }))
      .toEqual([{ text: "Traditional · Irish", link: { kind: "culture", key: "Irish", traditional: true } }]);
    expect(traditionalCredit("Traditional")).toEqual({ text: "Traditional", link: { kind: "person", key: "Traditional" } });
  });
});

describe("songRowText", () => {
  it("drops recording years, which only cards show", () => {
    const t = songRowText({ title: "Moondance", byline: "Van Morrison", displayArtist: "Van Morrison", composers: ["Van Morrison"], cultures: [], recordingArtists: [{ name: "Van Morrison", year: 1970 }, { name: "Michael Bublé", year: 2003 }] });
    expect(t).toMatchObject({ writers: "V. Morrison", line: "Van Morrison, Michael Bublé" });
  });
  it("leads with the show and keeps the identity line for songs not known by a recording", () => {
    expect(songRowText({ title: "x", displayArtist: "Julie Andrews", byline: "Julie Andrews", composers: [], cultures: [], recordingArtists: [], productions: ["The Sound of Music"] }).line).toBe("from The Sound of Music · Julie Andrews");
    expect(songRowText({ title: "Rio Grande", byline: "Traditional · English", displayArtist: null, composers: ["Traditional"], cultures: ["English"], recordingArtists: [], identity: { first_line: "Oh, say were you ever in Rio Grande?" } }))
      .toMatchObject({ writers: "Trad. · English", line: "“Oh, say were you ever in Rio Grande…”" });
  });
  it("hands the show titles and the credits over separately for italics", () => {
    const r = songRowText({ title: "My Shot", displayArtist: "Original Broadway Cast", composers: ["Lin-Manuel Miranda"], cultures: [], recordingArtists: [{ name: "Original Broadway Cast", year: 2015 }], byline: "Original Broadway Cast", productions: ["Hamilton"] });
    expect(r.shows).toEqual(["Hamilton"]);
    expect(r.credits).toBe("Original Broadway Cast");
    expect(r.line).toBe("from Hamilton · Original Broadway Cast");
  });
});
