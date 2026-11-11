import { describe, expect, it } from "vitest";
import { formatJammers, isUuid } from "./smallFormats";

describe("isUuid", () => {
  it("accepts ids in either case and rejects slugs", () => {
    expect(isUuid("632931c5-ccfd-4ba2-b217-3aba880b68cf")).toBe(true);
    expect(isUuid("632931C5-CCFD-4BA2-B217-3ABA880B68CF")).toBe(true);
    expect(isUuid("twist-and-shout-bert-russell-berns-phil-medley")).toBe(false);
    expect(isUuid("632931c5-ccfd-4ba2-b217-3aba880b68cf-2")).toBe(false);
  });
});

describe("formatJammers", () => {
  it("uses the singular for one", () => {
    expect(formatJammers(1)).toBe("1 jammer");
    expect(formatJammers(2)).toBe("2 jammers");
    expect(formatJammers(0)).toBe("0 jammers");
  });
});
