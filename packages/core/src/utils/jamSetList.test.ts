import { describe, expect, it } from "vitest";
import { jamSetListName, linkableSets } from "./jamSetList";

describe("jamSetListName", () => {
  it("names the set list after the jam", () => {
    expect(jamSetListName("Friday Folk Night")).toBe("Friday Folk Night — set list");
  });

  it("falls back when the jam has no name", () => {
    expect(jamSetListName(null)).toBe("Set list");
    expect(jamSetListName("  ")).toBe("Set list");
  });
});

describe("linkableSets", () => {
  it("lists owned sets before collaborating ones, once each", () => {
    const sets = linkableSets(
      [{ id: "a", name: "Mine" }],
      [{ id: "b", name: "Shared" }, { id: "a", name: "Mine" }],
      "jam-1",
    );
    expect(sets.map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("labels a set that belongs to another jam", () => {
    const [other, unnamed, here] = linkableSets(
      [
        { id: "a", name: "Hymns", jam_id: "jam-2", jam_name: "Sunday Sing" },
        { id: "b", name: "Rounds", jam_id: "jam-3", jam_name: null },
        { id: "c", name: "Ballads", jam_id: "jam-1" },
      ],
      [],
      "jam-1",
    );
    expect(other).toMatchObject({ label: "Hymns (linked to Sunday Sing)", linkedElsewhere: true });
    expect(unnamed).toMatchObject({ label: "Rounds (linked to another jam)", linkedElsewhere: true });
    expect(here).toMatchObject({ label: "Ballads", linkedElsewhere: false });
  });
});
