import { describe, it, expect } from "vitest";
import { formatComposersLong, sortByLastName } from "./formatComposers";

describe("formatComposersLong", () => {
  it("spells names out in full", () => {
    expect(formatComposersLong(["Otis Redding", "Aretha Franklin"], [])).toBe(
      "Otis Redding, Aretha Franklin"
    );
  });

  it("names the first culture alongside Traditional", () => {
    expect(formatComposersLong(["Traditional"], ["Nigerian", "Ghanaian"])).toBe(
      "Traditional · Nigerian"
    );
  });

  it("falls back to a bare Traditional when no culture is known", () => {
    expect(formatComposersLong(["Traditional"], [])).toBe("Traditional");
  });

  it("puts Traditional first and keeps the named writers after it", () => {
    expect(formatComposersLong(["Paul Simon", "traditional"], ["Zulu"])).toBe(
      "Traditional · Zulu, Paul Simon"
    );
  });

  it("returns an empty string when there are no names", () => {
    expect(formatComposersLong([], ["Nigerian"])).toBe("");
  });
});

describe("sortByLastName", () => {
  it("sorts on the last word, not the first", () => {
    expect(sortByLastName(["Otis Redding", "Aretha Franklin"])).toEqual([
      "Aretha Franklin",
      "Otis Redding",
    ]);
  });

  it("handles mononyms and extra whitespace", () => {
    expect(sortByLastName(["Sting", "  Nina  Simone  "])).toEqual([
      "  Nina  Simone  ",
      "Sting",
    ]);
  });

  it("does not mutate the input", () => {
    const names = ["Otis Redding", "Aretha Franklin"];
    sortByLastName(names);
    expect(names).toEqual(["Otis Redding", "Aretha Franklin"]);
  });
});
