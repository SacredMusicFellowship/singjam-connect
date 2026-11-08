import { describe, expect, it } from "vitest";
import { formatScriptureRef, psalmToGreekNumbering } from "./scripture";

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
