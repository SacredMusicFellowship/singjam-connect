import { describe, it, expect } from "vitest";
import { SINGING_LABEL, voiceBadgeClass } from "./singingVoice";

describe("SINGING_LABEL", () => {
  it("labels lead, backup, and none", () => {
    expect(SINGING_LABEL["lead"]).toBe("Lead vocals");
    expect(SINGING_LABEL["backup"]).toBe("Backup vocals");
    expect(SINGING_LABEL["none"]).toBe("Doesn't sing");
  });
});

describe("voiceBadgeClass", () => {
  it("returns amber classes for lead", () => {
    const cls = voiceBadgeClass("lead");
    expect(cls).toContain("amber");
    expect(cls).not.toContain("violet");
    expect(cls).not.toContain("zinc");
  });

  it("returns sky classes for backup, matching Support (violet is keys)", () => {
    const cls = voiceBadgeClass("backup");
    expect(cls).toContain("sky");
    expect(cls).not.toContain("violet");
    expect(cls).not.toContain("amber");
    expect(cls).not.toContain("zinc");
  });

  it("returns zinc classes for instruments (null)", () => {
    const cls = voiceBadgeClass(null);
    expect(cls).toContain("zinc");
    expect(cls).not.toContain("amber");
    expect(cls).not.toContain("violet");
  });
});
