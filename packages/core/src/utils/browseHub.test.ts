import { describe, expect, it } from "vitest";
import { loadBrowseHub, sortBrowseHub } from "./browseHub";

// A minimal stand-in for the Supabase client: each table returns fixed rows.
function fakeDb(tables: Record<string, unknown[]>, rpc: Record<string, unknown>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const q: any = {
        select: () => q, order: () => q, eq: () => q,
        range: async () => ({ data: rows, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows, error: null }),
      };
      return q;
    },
    rpc: async (name: string) => ({ data: rpc[name] ?? null, error: null }),
  };
}

describe("loadBrowseHub", () => {
  const db = fakeDb(
    {
      tags: [
        { id: "rock", name: "Rock", slug: "rock", type: "genre", is_top_level: true },
        { id: "classic", name: "Classic Rock", slug: "classic-rock", type: "genre", is_top_level: false },
        { id: "folk", name: "Folk", slug: "folk", type: "genre", is_top_level: true },
        { id: "klezmer", name: "Klezmer", slug: "klezmer", type: "genre", is_top_level: true },
        { id: "hymn", name: "Hymn", slug: "hymn", type: "form", is_top_level: true },
      ],
      people: [
        { name: "Traditional", slug: "traditional", song_composers: [{ count: 40 }], song_lyricists: [{ count: 30 }] },
        { name: "John Newton", slug: "john-newton", song_composers: [{ count: 0 }], song_lyricists: [{ count: 2 }] },
        { name: "One Song", slug: "one-song", song_composers: [{ count: 1 }], song_lyricists: [{ count: 1 }] },
      ],
      artists: [{ name: "The Weavers", slug: "the-weavers", song_recording_artists: [{ count: 3 }] }],
      productions: [
        { name: "Cinderella", slug: "cinderella-1950", year: 1950, medium: "animated", song_productions: [{ count: 1 }] },
        { name: "Victory", slug: "victory", year: null, medium: null, song_productions: [{ count: 0 }] },
      ],
    },
    { tag_song_counts: [{ tag_id: "rock", songs: 5 }, { tag_id: "classic", songs: 3 }, { tag_id: "folk", songs: 7 }, { tag_id: "hymn", songs: 2 }] }
  );

  it("lists top-level genres with songs, most first, and every form with songs", async () => {
    const hub = await loadBrowseHub(db);
    expect(hub.sections.find((s) => s.type === "genre")?.chips).toEqual([
      { href: "/genres/folk", label: "Folk", count: 7 },
      { href: "/genres/rock", label: "Rock", count: 5 },
    ]);
    expect(hub.sections.find((s) => s.type === "form")?.chips.map((c) => c.label)).toEqual(["Hymn"]);
    expect(hub.sections.find((s) => s.type === "genre")?.all.map((c) => c.label)).toEqual(["Folk", "Rock", "Classic Rock"]);
  });

  it("leaves out Traditional and one-song writers, and shows without songs", async () => {
    const hub = await loadBrowseHub(db);
    expect(hub.writers).toEqual([{ href: "/people/john-newton", label: "John Newton", count: 2 }]);
    expect(hub.writerTotal).toBe(2);
    expect(hub.artists.map((a) => a.label)).toEqual(["The Weavers"]);
    expect(hub.shows).toEqual([{ medium: "animated", label: "Animated film", chips: [{ href: "/shows/cinderella-1950", label: "Cinderella (1950)", count: 1 }] }]);
  });
});

describe("sortBrowseHub", () => {
  const hub = {
    sections: [{ type: "genre" as const, title: "Genres", chips: [{ href: "/g/rock", label: "Rock", count: 9 }, { href: "/g/folk", label: "Folk", count: 3 }], all: [{ href: "/g/rock", label: "Rock", count: 9 }, { href: "/g/folk", label: "Folk", count: 3 }] }],
    writers: [{ href: "/p/z", label: "Zed", count: 5 }, { href: "/p/a", label: "Ann", count: 2 }],
    writerTotal: 2, artists: [], artistTotal: 0,
    shows: [{ medium: "film", label: "Film", chips: [{ href: "/s/b", label: "Beta", count: 4 }, { href: "/s/a", label: "Alpha", count: 1 }] }],
  };
  it("keeps the loaded most-songs order", () => {
    expect(sortBrowseHub(hub, "count")).toBe(hub);
  });
  it("lists every section A–Z", () => {
    const az = sortBrowseHub(hub, "az");
    expect(az.sections[0].chips.map((c) => c.label)).toEqual(["Folk", "Rock"]);
    expect(az.sections[0].all.map((c) => c.label)).toEqual(["Folk", "Rock"]);
    expect(az.writers.map((c) => c.label)).toEqual(["Ann", "Zed"]);
    expect(az.shows[0].chips.map((c) => c.label)).toEqual(["Alpha", "Beta"]);
  });
});
