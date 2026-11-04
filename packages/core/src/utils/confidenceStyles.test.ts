import { describe, it, expect } from "vitest";
import { CONFIDENCE_LEVEL_OPTIONS, CONFIDENCE_STYLES, confidenceLabel, confidenceStyle } from "./confidenceStyles";

describe("confidence styles", () => {
  it("gives every level its own colour family", () => {
    expect(CONFIDENCE_STYLES.lead.pill).toContain("amber");
    expect(CONFIDENCE_STYLES.support.pill).toContain("sky");
    expect(CONFIDENCE_STYLES.learn.pill).toContain("zinc");
  });

  it("never uses green or indigo, which mean Played and 'add this song'", () => {
    for (const style of Object.values(CONFIDENCE_STYLES)) {
      expect(Object.values(style).join(" ")).not.toMatch(/green|indigo/);
    }
  });

  it("covers every selectable level", () => {
    for (const { key } of CONFIDENCE_LEVEL_OPTIONS) expect(CONFIDENCE_STYLES[key]).toBeDefined();
  });

  it("reads an unknown or missing level as Learn", () => {
    expect(confidenceStyle("expert")).toBe(CONFIDENCE_STYLES.learn);
    expect(confidenceStyle(null)).toBe(CONFIDENCE_STYLES.learn);
    expect(confidenceLabel(undefined)).toBe("Learn");
    expect(confidenceLabel("support")).toBe("Support");
  });
});
