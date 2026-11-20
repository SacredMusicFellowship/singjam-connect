import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/spotify", () => ({ getSpotifyToken: vi.fn().mockResolvedValue("token") }));

import { findOnSpotify } from "./songLookup";

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
