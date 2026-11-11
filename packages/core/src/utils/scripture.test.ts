import { describe, expect, it } from "vitest";
import { formatScriptureRef, formatSourceRef, sortSources, psalmToGreekNumbering, scriptureBookFromSlug, scriptureKey, scriptureReadUrl } from "./scripture";

describe("formatScriptureRef", () => {
  it("formats single verses, ranges and whole chapters", () => {
    expect(formatScriptureRef({ book: "Psalms", chapter_start: 133, verse_start: 1 })).toBe("Psalm 133:1");
    expect(formatScriptureRef({ book: "1 Chronicles", chapter_start: 17, verse_start: 16, verse_end: 17 })).toBe("1 Chronicles 17:16–17");
    expect(formatScriptureRef({ book: "Psalms", chapter_start: 23, verse_start: null })).toBe("Psalm 23");
    expect(formatScriptureRef({ book: "Psalms", chapter_start: 113, verse_start: 1, chapter_end: 118, verse_end: 29 })).toBe("Psalms 113:1–118:29");
  });
  it("falls back to the citation for other sources", () => {
    expect(formatScriptureRef({ book: null, chapter_start: null, verse_start: null, citation: "Masnavi I.1" })).toBe("Masnavi I.1");
  });
});

describe("psalmToGreekNumbering", () => {
  it("follows the Septuagint/Vulgate offsets", () => {
    expect(psalmToGreekNumbering(1)).toBe(1);
    expect(psalmToGreekNumbering(10)).toBe(9);
    expect(psalmToGreekNumbering(23)).toBe(22);
    expect(psalmToGreekNumbering(115)).toBe(113);
    expect(psalmToGreekNumbering(133)).toBe(132);
    expect(psalmToGreekNumbering(150)).toBe(150);
  });
});

describe("formatSourceRef", () => {
  it("says how the words use the passage", () => {
    expect(formatSourceRef({ book: "Psalms", chapter_start: 133, verse_start: 1, relation: "quoted" })).toBe("Psalm 133:1");
    expect(formatSourceRef({ book: "Psalms", chapter_start: 90, verse_start: null, relation: "metrical" })).toBe("after Psalm 90");
    expect(formatSourceRef({ book: "Psalms", chapter_start: 23, verse_start: null, relation: "paraphrase" })).toBe("after Psalm 23");
    expect(formatSourceRef({ book: "1 Chronicles", chapter_start: 17, verse_start: 16, verse_end: 17, relation: "inspired" })).toBe("inspired by 1 Chronicles 17:16–17");
  });
  it("leaves a non-scripture citation as it is", () => {
    expect(formatSourceRef({ book: null, chapter_start: null, verse_start: null, citation: "Sefer Charedim (Venice, 1601)", relation: "quoted" })).toBe("Sefer Charedim (Venice, 1601)");
  });
});

describe("scripture pages", () => {
  it("keys a passage by book and chapter", () => {
    expect(scriptureKey({ book: "Psalms", chapter_start: 90 })).toBe("psalms/90");
    expect(scriptureKey({ book: "Song of Songs", chapter_start: null })).toBe("song-of-songs");
    expect(scriptureKey({ book: "Masnavi", chapter_start: 1 })).toBeNull();
    expect(scriptureBookFromSlug("1-samuel")).toBe("1 Samuel");
  });
  it("reads the Hebrew Bible on Sefaria and the New Testament on Bible Gateway", () => {
    expect(scriptureReadUrl({ book: "Proverbs", chapter_start: 3, verse_start: 17, verse_end: 18, corpus: "tanakh" })?.href).toBe("https://www.sefaria.org/Proverbs.3.17-18?lang=bi");
    expect(scriptureReadUrl({ book: "1 Samuel", chapter_start: 7, verse_start: 12 })?.href).toBe("https://www.sefaria.org/1_Samuel.7.12?lang=bi");
    expect(scriptureReadUrl({ book: "John", chapter_start: 3, verse_start: 16, verse_end: 18, corpus: "new_testament" })?.href)
      .toBe("https://www.biblegateway.com/passage/?search=John%203%3A16-18&version=NRSVUE");
    expect(scriptureReadUrl({ book: null, chapter_start: null, verse_start: null, citation: "Amidah" })).toBeNull();
  });
});

describe("sortSources", () => {
  it("puts quoted words first, scripture in canonical order, inspiration last", () => {
    const refs = [
      { book: "1 Chronicles", chapter_start: 17, verse_start: 16, relation: "inspired" },
      { book: "Lamentations", chapter_start: 5, verse_start: 21, relation: "quoted" },
      { book: "Proverbs", chapter_start: 3, verse_start: 18, relation: "quoted" },
      { book: "Psalms", chapter_start: 90, verse_start: null, relation: "metrical" },
      { book: "Proverbs", chapter_start: 3, verse_start: 17, relation: "quoted" },
    ];
    expect(sortSources(refs).map(formatScriptureRef)).toEqual(["Proverbs 3:17", "Proverbs 3:18", "Lamentations 5:21", "Psalm 90", "1 Chronicles 17:16"]);
  });
});
