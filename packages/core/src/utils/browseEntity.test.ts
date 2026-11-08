import { describe, expect, it } from "vitest";
import { loadBrowseRelated } from "./browseEntity";

describe("loadBrowseRelated", () => {
  const rows = [
    { kind: "tag", type: "genre", name: "Rock", slug: "rock", songs: 73 },
    { kind: "tag", type: "genre", name: "Pop", slug: "pop", songs: 66 },
    { kind: "person", type: null, name: "John Lennon", slug: "john-lennon", songs: 74 },
    { kind: "person", type: null, name: "Paul McCartney", slug: "paul-mccartney", songs: 72 },
    { kind: "artist", type: null, name: "The Beatles", slug: "the-beatles", songs: 72 },
    { kind: "tag", type: "language", name: "English", slug: "english", songs: 74 },
  ];
  const db = { rpc: async () => ({ data: rows, error: null }) };

  it("groups what's common among the songs into links, leaving out the page itself", async () => {
    const groups = await loadBrowseRelated(db, ["s1"], { kind: "person", slug: "john-lennon" });
    expect(groups.map((g) => g.title)).toEqual(["Genres", "Songwriters", "Recording artists"]);
    expect(groups.find((g) => g.key === "person")?.chips).toEqual([{ href: "/people/paul-mccartney", label: "Paul McCartney", count: 72 }]);
    expect(groups[0].chips.map((c) => c.href)).toEqual(["/genres/rock", "/genres/pop"]);
  });

  it("returns nothing for a page without songs", async () => {
    expect(await loadBrowseRelated(db, [], { kind: "genre", slug: "rock" })).toEqual([]);
  });
});
