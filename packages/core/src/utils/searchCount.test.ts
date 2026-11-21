import { describe, expect, it } from "vitest";
import { searchCountLabel } from "./searchCount";

describe("searchCountLabel", () => {
  it("counts every match when all of them loaded", () => {
    expect(searchCountLabel({ shown: 31, loaded: 31, total: 31 })).toBe("31 songs");
    expect(searchCountLabel({ shown: 1, loaded: 1, total: 1 })).toBe("1 song");
    expect(searchCountLabel({ shown: 0, loaded: 0, total: 0 })).toBe("0 songs");
  });
  it("says how many matched in all when only some loaded", () => {
    expect(searchCountLabel({ shown: 50, loaded: 50, total: 76 })).toBe("Showing 50 of 76 songs");
    expect(searchCountLabel({ shown: 12, loaded: 50, total: 76 })).toBe("Showing 12 of 76 songs");
  });
  it("notes the filters when they hide some of a complete result", () => {
    expect(searchCountLabel({ shown: 12, loaded: 31, total: 31 })).toBe("12 songs (31 before filters)");
  });
});
