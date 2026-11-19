import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./normalizeSearch";

describe("normalizeSearch", () => {
  it("keeps ASCII text exactly as the old [^a-z0-9 ] rule did", () => {
    const old = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "");
    for (const s of ["It's O'Brien!", "Don't Stop Believin'", "C-A-T (3:20)\tok", "AC/DC & Co. #1 ~ {x}"]) {
      expect(normalizeSearch(s)).toBe(old(s));
    }
  });

  it("keeps Hebrew letters and drops niqqud, cantillation and Hebrew punctuation", () => {
    expect(normalizeSearch("שָׁלוֹם עֲלֵיכֶם")).toBe("שלום עליכם");
    expect(normalizeSearch("״אדון עולם״ — יִגְדַּל")).toBe("אדון עולם  יגדל");
    expect(normalizeSearch("בְּרֵאשִׁ֖ית")).toBe("בראשית");
  });

  it("keeps Arabic letters and drops harakat, tatweel and Arabic punctuation", () => {
    expect(normalizeSearch("أَهْلاً وسهلاً")).toBe("اهلا وسهلا");
    expect(normalizeSearch("طـــلع البدر علينا؟")).toBe("طلع البدر علينا");
  });

  it("folds accents and compatibility forms instead of deleting the letter", () => {
    expect(normalizeSearch("Café, “Olé”!")).toBe("cafe ole");
    expect(normalizeSearch("Ὦ Δέσποτα")).toBe("ω δεσποτα");
    expect(normalizeSearch("Катюша")).toBe("катюша");
    expect(normalizeSearch("ﬁne ﭏ")).toBe("fine אל");
  });

  it("normalizes a punctuation-only string to blank space", () => {
    expect(normalizeSearch("!!! — …")).toBe("  ");
  });
});

describe("matchesSearch", () => {
  it("matches a Hebrew query without vowels against pointed text", () => {
    expect(matchesSearch("Shalom Aleichem שָׁלוֹם עֲלֵיכֶם", "שלום")).toBe(true);
    expect(matchesSearch("Hava Nagila", "שלום")).toBe(false);
  });

  it("matches an Arabic query against text with harakat", () => {
    expect(matchesSearch("طَلَعَ الْبَدْرُ عَلَيْنَا", "البدر")).toBe(true);
  });

  it("matches accented text from an unaccented query", () => {
    expect(matchesSearch("Ave María", "maria")).toBe(true);
  });

  it("ignores punctuation on either side", () => {
    expect(matchesSearch("Don't Stop Believin' · Journey", "dont stop")).toBe(true);
    expect(matchesSearch("Jolene · Dolly Parton", "jolene, dolly")).toBe(true);
  });
});
