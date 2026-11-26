import { describe, expect, it, vi } from "vitest";

const spotify = vi.hoisted(() => ({ hit: null as null | { title: string; artist: string; spotify_url: string } }));
const mb = vi.hoisted(() => ({ credit: [{ name: "Harbour Lights" }] as { name: string; joinphrase?: string }[], linked: [] as unknown[][] }));

vi.mock("@/lib/enrichmentModels", () => ({
  askGptJson: async () => [{ artist: "Harbour Lights", year: 1964, why: "iconic" }],
  askClaudeJson: async () => [{ artist: "Harbour Lights", year: 1964, why: "iconic" }],
}));
vi.mock("@/lib/enrichmentSources", () => ({
  norm: (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  musicbrainz: async () => ({
    recordings: [{
      title: "Tide Song",
      "artist-credit": mb.credit,
      releases: [{ date: "1964-05-01", "release-group": { "primary-type": "Single", "secondary-types": [] } }],
    }],
  }),
}));
vi.mock("@/lib/songLookup", async (actual) => ({ ...(await actual<object>()), findOnSpotify: async () => spotify.hit }));
vi.mock("@/lib/enrichmentDb", () => ({
  idsFor: async () => ["artist-2"],
  linkMembers: async (...args: unknown[]) => { mb.linked.push(args.slice(1)); },
}));

import { addLandmarkRecordings } from "./enrichmentRecordings";

function fakeDb() {
  const inserts: Record<string, unknown>[] = [];
  const q: any = {
    select: () => q,
    eq: () => q,
    single: async () => ({ data: { title: "Tide Song", song_recording_artists: [{ position: 0, artists: { name: "Mara Quill" } }] } }),
    insert: (row: Record<string, unknown>) => { inserts.push(row); return Promise.resolve({ error: null }); },
  };
  return { db: { from: () => q } as any, inserts };
}

describe("addLandmarkRecordings", () => {
  it("saves the Spotify link of a landmark recording when Spotify has that exact track", async () => {
    spotify.hit = { title: "Tide Song", artist: "Harbour Lights", spotify_url: "https://open.spotify.com/track/abc" };
    const { db, inserts } = fakeDb();

    const { added } = await addLandmarkRecordings(db, "song-1");

    expect(added).toEqual([{ artist: "Harbour Lights", year: 1964, spotify_url: "https://open.spotify.com/track/abc" }]);
    expect(inserts).toEqual([{ song_id: "song-1", artist_id: "artist-2", year: 1964, spotify_url: "https://open.spotify.com/track/abc", position: 1 }]);
  });

  it("leaves the link empty when Spotify's track is someone else's", async () => {
    spotify.hit = { title: "Tide Song", artist: "Other Band", spotify_url: "https://open.spotify.com/track/zzz" };
    const { db, inserts } = fakeDb();

    const { added } = await addLandmarkRecordings(db, "song-1", { dryRun: true });

    expect(added[0].spotify_url).toBeNull();
    expect(inserts).toEqual([]);
  });
});

describe("addLandmarkRecordings — a duo's record", () => {
  it("adds one recording under the duo's credit and links its two artists", async () => {
    mb.credit = [{ name: "Harbour Lights", joinphrase: " & " }, { name: "Mara Quill" }];
    mb.linked = [];
    spotify.hit = null;
    const { db, inserts } = fakeDb();

    const { added } = await addLandmarkRecordings(db, "song-1");

    expect(added.map((a) => a.artist)).toEqual(["Harbour Lights & Mara Quill"]);
    expect(inserts).toHaveLength(1);
    expect(mb.linked).toEqual([["artist-2", ["Harbour Lights", "Mara Quill"]]]);
    mb.credit = [{ name: "Harbour Lights" }];
  });
});
