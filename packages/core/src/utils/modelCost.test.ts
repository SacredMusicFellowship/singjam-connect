import { describe, expect, it } from "vitest";
import { modelPrice, usageCost } from "./modelCost";

describe("usageCost", () => {
  it("prices each call at its model's input and output rate", () => {
    const { usd, unpriced } = usageCost([
      { model: "gpt-5.5-2026-04-23", input: 2_000, output: 1_000 },
      { model: "claude-opus-5-5", input: 3_000, output: 500 },
    ]);
    expect(usd).toBeCloseTo((2_000 * 5 + 1_000 * 30 + 3_000 * 4 + 500 * 20) / 1_000_000, 10);
    expect(unpriced).toEqual([]);
  });
  it("names models it has no price for instead of guessing", () => {
    expect(usageCost([{ model: "mystery-1", input: 10, output: 10 }])).toEqual({ usd: 0, unpriced: ["mystery-1"] });
    expect(modelPrice("gpt-5.55")).toBeNull();
  });
  it("adds web searches at a cent each", () => {
    expect(usageCost([{ model: "claude-opus-5-5", input: 0, output: 0, searches: 3 }]).usd).toBeCloseTo(0.03);
  });
});
