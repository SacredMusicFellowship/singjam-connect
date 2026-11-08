import { describe, expect, it } from "vitest";
import { matchedAlternateTitles, songCardPills, tagSlug } from "./songCard";

describe("tagSlug", () => {
  it("matches the database's slugs", () => {
    expect(tagSlug("Hip-Hop & Rap")).toBe("hip-hop-and-rap");
    expect(tagSlug("Shabbat table (zemirot)")).toBe("shabbat-table-zemirot");
    expect(tagSlug("Māori")).toBe("maori");
    expect(tagSlug("Black Church (US)")).toBe("black-church-us");
  });
});

describe("songCardPills", () => {
  it("puts form, occasion, genre, community and a non-English language first, one of each", () => {
    expect(songCardPills({ forms: ["Psalm setting"], genres: ["Folk"], communities: ["Jewish"], languages: ["Hebrew"] }).map((p) => p.name))
      .toEqual(["Psalm setting", "Folk", "Jewish"]);
    expect(songCardPills({ forms: ["Hymn"], genres: ["Gospel"], languages: ["English"] }).map((p) => p.name)).toEqual(["Hymn", "Gospel"]);
  });
  it("fills with more of a kind when there's room", () => {
    expect(songCardPills({ genres: ["Classic Rock", "Folk Rock", "Rock", "Pop"] }).map((p) => p.name)).toEqual(["Classic Rock", "Folk Rock", "Rock"]);
  });
  it("carries the type and slug for links", () => {
    expect(songCardPills({ communities: ["Rising Song (Hadar)"] })[0]).toEqual({ type: "community", name: "Rising Song (Hadar)", slug: "rising-song-hadar" });
  });
});

describe("matchedAlternateTitles", () => {
  it("shows an alternate title only when the search matched it and not the title", () => {
    expect(matchedAlternateTitles(["Nettleton"], "nettle", "Come Thou Fount of Every Blessing")).toEqual(["Nettleton"]);
    expect(matchedAlternateTitles(["Nettleton"], "fount", "Come Thou Fount of Every Blessing")).toEqual([]);
    expect(matchedAlternateTitles(["Nettleton"], "", "Come Thou Fount")).toEqual([]);
  });
});
