import { describe, it, expect } from "vitest";
import { closestArtist, isNearTitle, isSameTitle, sameSong, isSameArtistSpelling } from "./sameSong";

describe("isSameTitle", () => {
  it("ignores a leading 'The', plurals, apostrophes and case", () => {
    expect(isSameTitle("The Sounds of Silence", "sound of silence")).toBe(true);
    expect(isSameTitle("Ain't No Sunshine", "aint no sunshine")).toBe(true);
  });
  it("matches with or without a bracketed part", () => {
    expect(isSameTitle("(Sittin' On) The Dock of the Bay", "The Dock of the Bay")).toBe(true);
  });
  it("forgives a small typo in a longer title", () => {
    expect(isSameTitle("With A Litte Help From My Friends", "With a Little Help from My Friends")).toBe(true);
  });
  it("stays fast on pathological input", () => {
    const t0 = Date.now();
    isSameTitle("(".repeat(50000), "(".repeat(50000) + "x");
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("keeps genuinely different titles apart", () => {
    expect(isSameTitle("Sweet Dreams", "Dreams")).toBe(false);
    expect(isSameTitle("Hey Jude", "Hey You")).toBe(false);
  });
});

describe("sameSong", () => {
  it("is the same song when a title matches and an artist is shared", () => {
    expect(sameSong({ title: "The Sound of Silence", artists: ["Simon & Garfunkel"] }, { title: "The Sounds of Silence", artists: ["Simon and Garfunkel", "Disturbed"] })).toBe("same");
  });
  it("treats one title by unrelated artists as different songs", () => {
    expect(sameSong({ title: "Dreams", artists: ["Fleetwood Mac"] }, { title: "Dreams", artists: ["The Cranberries"] })).toBe(false);
  });
  it("is only a possible match when one side has no artist", () => {
    expect(sameSong({ title: "Summertime", artists: [] }, { title: "Summertime", artists: ["Ella Fitzgerald"] })).toBe("possible");
  });
});

describe("isSameArtistSpelling", () => {
  it("accepts a typo in the artist someone typed", () => {
    expect(isSameArtistSpelling("Fleewood Mac", "Fleetwood Mac")).toBe(true);
    expect(isSameArtistSpelling("Doly Parton", "Dolly Parton")).toBe(true);
    expect(isSameArtistSpelling("Beatles", "The Beatles")).toBe(true);
  });
  it("rejects a different act", () => {
    expect(isSameArtistSpelling("Toto", "Tool")).toBe(false);
    expect(isSameArtistSpelling("Muse", "Mase")).toBe(false);
    expect(isSameArtistSpelling("Totto", "TOTO")).toBe(false);
    expect(isSameArtistSpelling("Fleetwood Mac", "Snoop Dogg")).toBe(false);
    expect(isSameArtistSpelling("Bad Wolves", "Dolly Parton")).toBe(false);
    expect(isSameArtistSpelling("", "Adele")).toBe(false);
  });
});

describe("closestArtist", () => {
  const known = ["Fleetwood Mac", "Mac Miller", "Dolly Parton", "The Beatles", "Muse"];
  it("finds the artist a typo spells", () => {
    expect(closestArtist("Fleewood Mac", known)).toBe("Fleetwood Mac");
    expect(closestArtist("Beatles", known)).toBe("The Beatles");
    expect(closestArtist("dolly parton", known)).toBe("Dolly Parton");
  });
  it("returns nothing for a new artist or a near short name", () => {
    expect(closestArtist("Mase", known)).toBeNull();
    expect(closestArtist("Phoebe Bridgers", known)).toBeNull();
    expect(closestArtist("", known)).toBeNull();
  });
  it("won't choose between two equally close names", () => {
    expect(closestArtist("Jon Smith", ["John Smith", "Jon Smyth"])).toBeNull();
  });
});

describe("isNearTitle", () => {
  it("allows a typo in a short title", () => {
    expect(isNearTitle("Everywere", "Everywhere")).toBe(true);
    expect(isNearTitle("Jolenne", "Jolene")).toBe(true);
  });
  it("keeps short different titles apart", () => {
    expect(isNearTitle("Rain", "Pain")).toBe(false);
    expect(isNearTitle("Dreams", "Gypsy")).toBe(false);
  });
});

describe("sameSong with a misspelled artist", () => {
  it("is still the same song", () => {
    expect(sameSong({ title: "Dreams", artists: ["Fleetwod Mac"] }, { title: "Dreams", artists: ["Fleetwood Mac"] })).toBe("same");
    expect(sameSong({ title: "Dreams", artists: ["The Cranberries"] }, { title: "Dreams", artists: ["Fleetwood Mac"] })).toBe(false);
  });
});
