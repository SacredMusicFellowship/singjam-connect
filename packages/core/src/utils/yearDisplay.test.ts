import { describe, expect, it } from "vitest";
import { formatYear } from "./yearDisplay";

describe("formatYear", () => {
  it("shows a date at its precision", () => {
    expect(formatYear(1719, "exact")).toBe("1719");
    expect(formatYear(1600, "circa")).toBe("c. 1600");
    expect(formatYear(1846, "decade")).toBe("1840s");
    expect(formatYear(1550, "century")).toBe("16th c.");
    expect(formatYear(750, "century")).toBe("8th c.");
    expect(formatYear(1250, "century")).toBe("13th c.");
    expect(formatYear(1050, "century")).toBe("11th c.");
    expect(formatYear(2001, "century")).toBe("21st c.");
    expect(formatYear(null, "exact")).toBeNull();
  });
});
