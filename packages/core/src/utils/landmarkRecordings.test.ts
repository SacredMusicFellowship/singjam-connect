import { describe, expect, it } from "vitest";
import { agreedLandmarks, landmarkYear, leadArtist, sameArtist, type LandmarkCandidate } from "./landmarkRecordings";
import { MAX_RECORDINGS } from "./formatRecordingArtists";

const rec = (artist: string, year: number, why: LandmarkCandidate["why"] = "iconic"): LandmarkCandidate => ({ artist, year, why });

describe("sameArtist", () => {
  it("matches credit spellings of the same act", () => {
    expect(sameArtist("Collins and Harlan", "Arthur Collins & Byron Harlan")).toBe(true);
    expect(sameArtist("Isley Brothers", "The Isley Brothers")).toBe(true);
    expect(sameArtist("Bing Crosby and Connee Boswell", "Bing Crosby & Connee Boswell")).toBe(true);
    expect(sameArtist("Glenn Miller and His Orchestra", "Glenn Miller Orchestra")).toBe(true);
  });

  it("keeps different acts apart", () => {
    expect(sameArtist("Elvis", "Elvis Costello")).toBe(false);
    expect(sameArtist("Bing Crosby", "Bing Crosby & Connee Boswell")).toBe(true);
    expect(sameArtist("Duke Ellington", "Mercer Ellington")).toBe(false);
    expect(sameArtist("", "Anyone")).toBe(false);
  });
});

describe("leadArtist", () => {
  it("takes the first-named artist", () => {
    expect(leadArtist("Bing Crosby & Connee Boswell")).toBe("Bing Crosby");
    expect(leadArtist("Mark Ronson featuring Bruno Mars")).toBe("Mark Ronson");
    expect(leadArtist("Crosby, Stills, Nash & Young")).toBe("Crosby");
    expect(leadArtist("Simon & Garfunkel")).toBe("Simon");
  });
});

describe("agreedLandmarks", () => {
  it("keeps only recordings both models name", () => {
    const out = agreedLandmarks(
      [rec("Collins and Harlan", 1911, "original"), rec("Bing Crosby and Connee Boswell", 1938)],
      [rec("Arthur Collins and Byron Harlan", 1911, "original"), rec("Bessie Smith", 1927)],
      ["Ray Charles"],
    );
    expect(out).toEqual([{ artist: "Collins and Harlan", altArtist: "Arthur Collins and Byron Harlan", gptYear: 1911, claudeYear: 1911, why: "original" }]);
  });

  it("returns nothing when either model has nothing", () => {
    expect(agreedLandmarks([rec("Matt Monro", 1965)], [], ["The Beatles"])).toEqual([]);
    expect(agreedLandmarks(null, [rec("Matt Monro", 1965)], ["The Beatles"])).toEqual([]);
  });

  it("skips artists the song already has", () => {
    expect(agreedLandmarks([rec("Whitney Houston", 1992)], [rec("Whitney Houston", 1992)], ["Dolly Parton", "Whitney Houston"])).toEqual([]);
  });

  it("caps the song at MAX_RECORDINGS", () => {
    const four = ["A One", "B Two", "C Three", "D Four"].map((a, i) => rec(a, 1950 + i));
    expect(agreedLandmarks(four, four, ["Given Artist"])).toHaveLength(MAX_RECORDINGS - 1);
    expect(agreedLandmarks(four, four, ["W X", "Y Z", "Q R", "S T"])).toEqual([]);
  });
});

describe("landmarkYear", () => {
  it("prefers MusicBrainz when it is near both models", () => {
    expect(landmarkYear(1943, 1943, 1942)).toBe(1942);
  });

  it("falls back to the models when they agree exactly", () => {
    expect(landmarkYear(1939, 1939, 1950)).toBe(1939);
    expect(landmarkYear(1911, 1911, null)).toBe(1911);
  });

  it("gives up when nothing agrees", () => {
    expect(landmarkYear(1940, 1943, null)).toBeNull();
    expect(landmarkYear(1940, 1943, 1960)).toBeNull();
  });
});

describe("leadArtist on hostile input", () => {
  it("stays fast on long runs of spaces", () => {
    const start = Date.now();
    expect(leadArtist("a" + " ".repeat(50000) + "and b")).toBe("a");
    expect(Date.now() - start).toBeLessThan(100);
  });
});
