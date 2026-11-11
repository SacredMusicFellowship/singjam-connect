import { describe, it, expect } from "vitest";
import { productionCredits } from "./productionCredits";

describe("productionCredits", () => {
  it("uses the credits when present", () => {
    expect(productionCredits([{ name: "The Wizard of Oz", year: 1939 }], ["The Wizard of Oz"])).toEqual([
      { name: "The Wizard of Oz", year: 1939 },
    ]);
  });

  it("falls back to the bare names without years", () => {
    expect(productionCredits(undefined, ["Hamilton"])).toEqual([{ name: "Hamilton", year: null }]);
    expect(productionCredits([], ["Hamilton"])).toEqual([{ name: "Hamilton", year: null }]);
  });

  it("returns nothing for a song that isn't from a production", () => {
    expect(productionCredits(null, null)).toEqual([]);
  });
});
