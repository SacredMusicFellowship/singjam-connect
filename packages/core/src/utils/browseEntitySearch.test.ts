import { describe, expect, it, vi } from "vitest";
import { browseEntityRow, searchBrowseEntities } from "./browseEntitySearch";

describe("browseEntityRow", () => {
  it("links the browse page and says what it is and how many songs", () => {
    expect(browseEntityRow({ kind: "person", key: "woody-guthrie", name: "Woody Guthrie", song_count: 7 })).toEqual({
      id: "person:woody-guthrie", href: "/people/woody-guthrie", name: "Woody Guthrie", detail: "Songwriter · 7 songs",
    });
    expect(browseEntityRow({ kind: "artist", key: "the-beatles", name: "The Beatles", song_count: 81 }).detail).toBe("Recording artist · 81 songs");
    expect(browseEntityRow({ kind: "tune", key: "new-britain", name: "New Britain", song_count: 1 })).toMatchObject({ href: "/tunes/new-britain", detail: "Tune · 1 song" });
    expect(browseEntityRow({ kind: "text", key: "etz-chayim-hi", name: "Etz Chayim Hi", song_count: 2 }).href).toBe("/texts/etz-chayim-hi");
    expect(browseEntityRow({ kind: "show", key: "the-sound-of-music", name: "The Sound of Music", song_count: 3 }).detail).toBe("Show · 3 songs");
  });
});

describe("searchBrowseEntities", () => {
  it("skips the call for an empty query", async () => {
    const db = { rpc: vi.fn() };
    expect(await searchBrowseEntities(db, "   ")).toEqual([]);
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("asks for the top five matches of the trimmed query, in the order given", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: [
      { kind: "person", key: "woody-guthrie", name: "Woody Guthrie", song_count: 7 },
      { kind: "artist", key: "arlo-guthrie", name: "Arlo Guthrie", song_count: 2 },
    ], error: null }) };
    const rows = await searchBrowseEntities(db, " guthrie ");
    expect(db.rpc).toHaveBeenCalledWith("search_browse_entities", { q: "guthrie", limit_n: 5 });
    expect(rows.map((r) => r.id)).toEqual(["person:woody-guthrie", "artist:arlo-guthrie"]);
  });
  it("throws when the search fails", async () => {
    const db = { rpc: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }) };
    await expect(searchBrowseEntities(db, "a")).rejects.toThrow("boom");
  });
});
