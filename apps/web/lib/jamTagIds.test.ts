import { describe, expect, it } from "vitest";
import { jamTagIdsFromBody } from "./jamTagIds";

describe("jamTagIdsFromBody", () => {
  it("takes the one picker's tag_ids", () => {
    expect(jamTagIdsFromBody({ tag_ids: ["shabbat", "folk"] })).toEqual(["shabbat", "folk"]);
  });
  it("still accepts genre_ids and theme_ids from older app builds, without duplicates", () => {
    expect(jamTagIdsFromBody({ genre_ids: ["folk"], theme_ids: ["joy"], tag_ids: ["folk"] })).toEqual(["folk", "joy"]);
  });
  it("ignores anything that isn't a list of ids", () => {
    expect(jamTagIdsFromBody({ tag_ids: "folk", genre_ids: [null, "", 3, "rock"] })).toEqual(["rock"]);
    expect(jamTagIdsFromBody({})).toEqual([]);
  });
});
