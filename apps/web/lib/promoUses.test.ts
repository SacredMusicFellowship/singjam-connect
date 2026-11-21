import { describe, it, expect } from "vitest";
import { promoUses } from "./promoUses";

describe("promoUses", () => {
  it("says how many times a code was used", () => {
    expect(promoUses(1)).toBe("Used 1 time");
    expect(promoUses(2)).toBe("Used 2 times");
  });

  it("says when a code hasn't been used", () => {
    expect(promoUses(0)).toBe("Not used yet");
  });

  it("says when the count can't be read", () => {
    expect(promoUses(null)).toBe("Use count unavailable");
  });
});
