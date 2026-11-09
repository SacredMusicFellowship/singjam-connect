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
        [{ text: "also sung as 2 other songs", link: { kind: "text", key: "come-thou-fount" } }],
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
      [{ text: "Psalm 133:1", link: { kind: "text", key: "hinei-ma-tov" } }],
    ] });
  });
  it("ignores an unnamed tune and leaves out empty lines", () => {
    expect(songCreditLines({ composers: [p("Shlomo Carlebach")], lyricists: [], musicCultures: [], lyricsCultures: [], tune: { name: null, slug: "tune-1" } }))
      .toEqual([{ label: "Music", groups: [[{ text: "Shlomo Carlebach", link: { kind: "person", key: "Shlomo Carlebach" } }]] }]);
  });
});
