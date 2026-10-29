import { describe, it, expect } from "vitest";
import { isJamImageType } from "./jamImageTypes";

describe("isJamImageType", () => {
  it("accepts PNG and JPEG", () => {
    expect(isJamImageType("image/png")).toBe(true);
    expect(isJamImageType("image/jpeg")).toBe(true);
    expect(isJamImageType("IMAGE/JPEG")).toBe(true);
  });

  it("rejects formats the link preview cannot draw", () => {
    expect(isJamImageType("image/webp")).toBe(false);
    expect(isJamImageType("image/heic")).toBe(false);
    expect(isJamImageType("image/gif")).toBe(false);
  });

  it("falls back to the file name when no type is reported", () => {
    expect(isJamImageType(undefined, "file:///tmp/ABC.JPG")).toBe(true);
    expect(isJamImageType(null, "cover.png")).toBe(true);
    expect(isJamImageType(undefined, "cover.webp")).toBe(false);
  });

  it("trusts a reported type over the file name", () => {
    expect(isJamImageType("image/webp", "cover.jpg")).toBe(false);
  });

  it("rejects a missing type with no usable file name", () => {
    expect(isJamImageType(null)).toBe(false);
    expect(isJamImageType(undefined)).toBe(false);
    expect(isJamImageType("")).toBe(false);
  });
});
