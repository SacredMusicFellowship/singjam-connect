import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/spotify", () => ({ getSpotifyToken: vi.fn().mockResolvedValue("token") }));

import { findExistingSong, findKnownArtist, findOnSpotify } from "./songLookup";

const track = (name: string, artist: string) => ({
  name,
  artists: [{ name: artist }],
  album: { album_type: "album", release_date: "1987-04-13" },
  external_urls: { spotify: `https://open.spotify.com/track/${name.replace(/\W/g, "")}` },
});

// Answers the exact-artist search with `exact` and the plain search with `plain`.
function spotify(exact: any[], plain: any[]) {
  const queries: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const q = new URL(url).searchParams.get("q")!;
    queries.push(q);
    return { ok: true, json: async () => ({ tracks: { items: q.startsWith("track:") ? exact : plain } }) };
  }));
  return queries;
}

beforeEach(() => vi.unstubAllGlobals());

describe("findOnSpotify", () => {
  it("finds the recording when the artist is misspelled", async () => {
    const queries = spotify([], [track("Everywhere", "Fleetwood Mac"), track("Young, Wild & Free", "Snoop Dogg")]);
    expect(await findOnSpotify("Everywhere", "Fleewood Mac")).toMatchObject({ title: "Everywhere", artist: "Fleetwood Mac", release_year: 1987 });
    expect(queries).toEqual(["track:Everywhere artist:Fleewood Mac", "Everywhere Fleewood Mac"]);
  });

  it("won't take a different song or a different act from the plain search", async () => {
    spotify([], [track("Young, Wild & Free", "Snoop Dogg"), track("Everywhere", "Michelle Branch")]);
    expect(await findOnSpotify("Everywhere", "Fleewood Mac")).toBeNull();
  });

  it("skips a cover the artist filter guessed and finds the typed artist's own recording", async () => {
    spotify([track("Jolene (With Dolly Parton)", "Bad Wolves")], [track("Jolene", "Dolly Parton")]);
    expect(await findOnSpotify("Jolene", "Doly Parton")).toMatchObject({ title: "Jolene", artist: "Dolly Parton" });
  });

  it("returns nothing rather than an unrelated track the filter guessed", async () => {
    spotify([track("Everything & Everywhere Is Grace", "Fire-Toolz")], []);
    expect(await findOnSpotify("Everywhere", "Tool")).toBeNull();
  });

  it("still takes a same-titled track credited under another name", async () => {
    spotify([track("Proud Mary", "Creedence Clearwater Revival")], []);
    expect(await findOnSpotify("Proud Mary", "CCR")).toMatchObject({ artist: "Creedence Clearwater Revival" });
  });

  it("uses the exact search when it finds something", async () => {
    const queries = spotify([track("Jolene", "Dolly Parton")], []);
    expect(await findOnSpotify("Jolene", "Dolly Parton")).toMatchObject({ artist: "Dolly Parton" });
    expect(queries).toHaveLength(1);
  });
});

// similar_artists returns these; search_songs finds nothing (a misspelled title);
// the artist's own songs come from song_recording_artists.
function library(artists: { id: string; name: string }[], songsByArtist: Record<string, any[]> = {}) {
  return {
    rpc: async (fn: string) => ({ data: fn === "similar_artists" ? artists : [], error: null }),
    from: () => {
      let artistId = "";
      const q: any = {
        select: () => q,
        eq: (_: string, v: string) => ((artistId = v), q),
        order: () => q,
        range: async (from: number) => ({ data: from === 0 ? songsByArtist[artistId] ?? [] : [], error: null }),
      };
      return q;
    },
  } as any;
}

describe("findKnownArtist", () => {
  it("returns our spelling of a misspelled artist", async () => {
    const db = library([{ id: "fm", name: "Fleetwood Mac" }, { id: "mm", name: "Mac Miller" }]);
    expect(await findKnownArtist(db, "Fleewood Mac")).toEqual({ id: "fm", name: "Fleetwood Mac" });
  });
  it("returns nothing for an artist we don't have", async () => {
    expect(await findKnownArtist(library([{ id: "mm", name: "Mac Miller" }]), "Phoebe Bridgers")).toBeNull();
  });
  it("throws rather than let a duplicate be created when the database fails", async () => {
    const db = { rpc: async () => ({ data: null, error: new Error("down") }) } as any;
    await expect(findKnownArtist(db, "Fleewood Mac")).rejects.toThrow("down");
  });
});

describe("findExistingSong", () => {
  const db = library([{ id: "fm", name: "Fleetwood Mac" }], {
    fm: [{ song_id: "s1", songs: { slug: "everywhere", title: "Everywhere", display_artist: "Fleetwood Mac", song_alternate_titles: [] } }],
  });
  it("finds the artist's song under a misspelled title and artist", async () => {
    expect(await findExistingSong(db, ["Everywere"], "Fleewood Mac")).toMatchObject({ id: "s1", match: "possible" });
  });
  it("calls it the same song when only the artist was misspelled", async () => {
    expect(await findExistingSong(db, ["Everywhere"], "Fleewood Mac")).toMatchObject({ id: "s1", match: "same" });
  });
  it("leaves a different song by the artist alone", async () => {
    expect(await findExistingSong(db, ["Dreams"], "Fleetwood Mac")).toBeNull();
  });
});
