import { describe, expect, it } from "vitest";
import { songCreditLines } from "./songCreditLines";

const p = (name: string, slug?: string) => ({ name, slug });

describe("songCreditLines", () => {
  it("gives one Words & music line when the same people wrote both", () => {
    expect(songCreditLines({ composers: [p("Chris Tomlin", "chris-tomlin")], lyricists: [p("Chris Tomlin", "chris-tomlin")], musicCultures: [], lyricsCultures: [] }))
      .toEqual([{ label: "Words & music", groups: [[{ text: "Chris Tomlin", link: { kind: "person", key: "chris-tomlin" } }]] }]);
  });
  it("splits words and music, leading the music with a named tune", () => {
    const lines = songCreditLines({
      composers: [p("Traditional")], lyricists: [p("Robert Robinson", "robert-robinson")],
      musicCultures: ["American"], lyricsCultures: [],
      text: { slug: "come-thou-fount", songs: [{ count: 3 }], text_sources: [{ book: "1 Samuel", chapter_start: 7, verse_start: 12, relation: "inspired" }] },
      tune: { name: "Nettleton", slug: "nettleton" },
    });
    expect(lines).toEqual([
      { label: "Words", groups: [
        [{ text: "Robert Robinson", link: { kind: "person", key: "robert-robinson" } }],
        [{ text: "also sung to 2 other tunes", link: { kind: "text", key: "come-thou-fount" } }],
      ] },
      { label: "Music", groups: [
        [{ text: "Nettleton", link: { kind: "tune", key: "nettleton" } }],
        [{ text: "Traditional · American", link: { kind: "culture", key: "American", traditional: true } }],
      ] },
    ]);
  });
  it("shows the scripture the words set and leaves out a text sung by no other song", () => {
    const lines = songCreditLines({
      composers: [p("Traditional")], lyricists: [p("Traditional")], musicCultures: [], lyricsCultures: [],
      text: { slug: "hinei-ma-tov", songs: [{ count: 1 }], text_sources: [{ book: "Psalms", chapter_start: 133, verse_start: 1 }] },
    });
    expect(lines[0]).toEqual({ label: "Words", groups: [
      [{ text: "Traditional", link: { kind: "person", key: "Traditional" } }],
      [{ text: "Psalm 133:1", link: { kind: "scripture", key: "psalms/133" } }],
    ] });
  });
  it("says a paraphrase is after its psalm and links a non-scripture source to the text", () => {
    const watts = songCreditLines({
      composers: [p("William Croft")], lyricists: [p("Isaac Watts")], musicCultures: [], lyricsCultures: [],
      text: { slug: "o-god", songs: [{ count: 2 }], text_sources: [{ book: "Psalms", chapter_start: 90, verse_start: null, relation: "metrical" }] },
    });
    expect(watts[0].groups.slice(1)).toEqual([
      [{ text: "after Psalm 90", link: { kind: "scripture", key: "psalms/90" } }],
      [{ text: "also sung to 1 other tune", link: { kind: "text", key: "o-god" } }],
    ]);
    const yedid = songCreditLines({
      composers: [p("Sara Zweig")], lyricists: [p("Elazar Azikri")], musicCultures: [], lyricsCultures: [],
      text: { slug: "yedid-nefesh", songs: [{ count: 1 }], text_sources: [{ book: null, chapter_start: null, verse_start: null, citation: "Sefer Charedim (Venice, 1601)", relation: "quoted" }] },
    });
    expect(yedid[0].groups[1]).toEqual([{ text: "Sefer Charedim (Venice, 1601)", link: { kind: "text", key: "yedid-nefesh" } }]);
  });
  it("dates the words and the music at their precision", () => {
    const lines = songCreditLines({
      composers: [p("Rowland H. Prichard")], lyricists: [p("Charles Wesley")], musicCultures: [], lyricsCultures: [],
      text: { slug: "love-divine", year: 1747, year_precision: "exact", songs: [{ count: 1 }] },
      tune: { name: "Hyfrydol", slug: "hyfrydol", year: 1844, year_precision: "exact" },
    });
    expect(lines.map((l) => l.groups.map((g) => g.map((c) => c.text).join(", ")).join(" · "))).toEqual(["Charles Wesley · 1747", "Hyfrydol · Rowland H. Prichard · 1844"]);
    const old = songCreditLines({ composers: [p("Traditional")], lyricists: [p("Traditional")], musicCultures: [], lyricsCultures: [], text: { slug: "maoz", year: 1250, year_precision: "century", songs: [{ count: 1 }] } });
    expect(old[0].groups[1]).toEqual([{ text: "13th c.", link: null }]);
  });
  it("ignores an unnamed tune and leaves out empty lines", () => {
    expect(songCreditLines({ composers: [p("Shlomo Carlebach")], lyricists: [], musicCultures: [], lyricsCultures: [], tune: { name: null, slug: "tune-1" } }))
      .toEqual([{ label: "Music", groups: [[{ text: "Shlomo Carlebach", link: { kind: "person", key: "Shlomo Carlebach" } }]] }]);
  });
});
