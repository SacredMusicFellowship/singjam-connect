import { describe, it, expect } from "vitest";
import { hasLeadVoice, voiceBadgeClass } from "./singingVoice";

describe("hasLeadVoice", () => {
  it("is true only when lead is one of the voices", () => {
    expect(hasLeadVoice("lead")).toBe(true);
    expect(hasLeadVoice("backup,lead")).toBe(true);
    expect(hasLeadVoice("backup")).toBe(false);
    expect(hasLeadVoice("none")).toBe(false);
    expect(hasLeadVoice(null)).toBe(false);
  });

  it("doesn't read a backup singer who also lists none as a lead", () => {
    expect(hasLeadVoice("backup,none")).toBe(false);
  });
});

describe("voiceBadgeClass", () => {
  it("colours backup vocals like Support, not like a key", () => {
    expect(voiceBadgeClass("backup")).toContain("sky");
    expect(voiceBadgeClass("backup")).not.toContain("violet");
    expect(voiceBadgeClass("lead")).toContain("amber");
    expect(voiceBadgeClass(null)).toContain("zinc");
  });
});
