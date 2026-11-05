import { describe, it, expect } from "vitest";
import { isSameTitle, sameSong } from "./sameSong";

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
