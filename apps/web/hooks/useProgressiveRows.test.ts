import { describe, it, expect } from "vitest";
import { firstRowCount, FIRST_ROWS } from "./useProgressiveRows";

describe("firstRowCount", () => {
  it("draws a screenful on a fresh visit", () => {
    expect(firstRowCount(null, 800)).toBe(FIRST_ROWS);
    expect(firstRowCount(0, 800)).toBe(FIRST_ROWS);
  });

  it("draws past the saved position on a return visit, so scroll restoration has rows to land on", () => {
    const y = 30000;
    const count = firstRowCount(y, 800);
    // Even at an unrealistically short 60px per row, the rows drawn reach a
    // screen beyond where the visitor left off.
    expect(count * 60).toBeGreaterThanOrEqual(y + 800);
  });

  it("grows with how far down the visitor was", () => {
    expect(firstRowCount(20000, 800)).toBeGreaterThan(firstRowCount(2000, 800));
  });
});
