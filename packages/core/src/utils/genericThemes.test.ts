import { describe, expect, it } from "vitest";
import { withoutGenericFaithThemes } from "./genericThemes";

describe("withoutGenericFaithThemes", () => {
  it("drops Faith and Spirituality from a song known as religious", () => {
    expect(withoutGenericFaithThemes(["Faith", "Hope", "Spirituality"], { communities: ["Christian"] })).toEqual(["Hope"]);
    expect(withoutGenericFaithThemes(["Faith", "Freedom"], { genres: ["Spiritual"] })).toEqual(["Freedom"]);
    expect(withoutGenericFaithThemes(["Spirituality"], { forms: ["Nigun"] })).toEqual([]);
  });
  it("keeps them on a secular song", () => {
    expect(withoutGenericFaithThemes(["Faith", "Love"], { genres: ["Rock"], forms: ["Ballad"] })).toEqual(["Faith", "Love"]);
  });
});
