import { describe, expect, it } from "vitest";
import { parseTagSpecs, parseWriters } from "./songAddDetails";

describe("parseWriters", () => {
  it("takes a list or a semicolon-separated string, trimmed and without repeats", () => {
    expect(parseWriters(["Traditional", " traditional "])).toEqual(["Traditional"]);
    expect(parseWriters("Brian Johnson; Jenn Johnson ;")).toEqual(["Brian Johnson", "Jenn Johnson"]);
  });
  it("ignores anything that isn't text", () => {
    expect(parseWriters([null, 3, ""])).toEqual([]);
    expect(parseWriters(undefined)).toEqual([]);
  });
});

describe("parseTagSpecs", () => {
  it("reads type:Name pairs and keeps names that repeat across types apart", () => {
    expect(parseTagSpecs("genre:Cajun; culture:Cajun; occasion: Pub sing")).toEqual([
      { type: "genre", name: "Cajun" },
      { type: "culture", name: "Cajun" },
      { type: "occasion", name: "Pub sing" },
    ]);
  });
  it("keeps colons inside the name", () => {
    expect(parseTagSpecs(["form:Round / Canon", "occasion:Friday night (Kabbalat Shabbat)"])).toEqual([
      { type: "form", name: "Round / Canon" },
      { type: "occasion", name: "Friday night (Kabbalat Shabbat)" },
    ]);
  });
  it("drops unknown types, missing names and repeats", () => {
    expect(parseTagSpecs("mood:Happy; genre:; Folk; GENRE:Folk; genre:folk")).toEqual([{ type: "genre", name: "Folk" }]);
  });
});
