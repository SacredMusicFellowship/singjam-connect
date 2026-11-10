import { beforeEach, describe, expect, it, vi } from "vitest";

const answers = vi.hoisted(() => ({ gpt: [] as unknown[], claude: [] as unknown[] }));

vi.mock("openai", () => ({
  default: class {
    chat = {
      completions: {
        create: async () => ({ model: "gpt", usage: {}, choices: [{ message: { content: JSON.stringify({ recordings: answers.gpt }) } }] }),
      },
    };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: async () => ({
          model: "claude",
          usage: { input_tokens: 0, output_tokens: 0 },
          stop_reason: "end_turn",
          content: [{ type: "text", text: JSON.stringify({ recordings: answers.claude }) }],
        }),
      },
    };
  },
}));

vi.mock("@/lib/songLookup", () => ({ findOnSpotify: async () => null }));

import { addFirstRecordings, addLandmarkRecordings } from "./songEnrichment";

type Row = Record<string, unknown>;

// Just enough of the Supabase client for addLandmarkRecordings.
function fakeDb(existing: string[]) {
  const artists: Row[] = existing.map((name, i) => ({ id: `a${i}`, name }));
  const inserted: Row[] = [];
  const song = {
    title: "Alexander's Ragtime Band",
    song_recording_artists: existing.map((name, i) => ({ position: i, artists: { name } })),
  };
  const db = {
    from(table: string) {
      let filter: string | null = null;
      const q: any = {
        select: () => q,
        eq: () => q,
        ilike: (_: string, v: string) => ((filter = v), q),
        limit: () => q,
        single: async () => ({ data: table === "songs" ? song : null }),
        maybeSingle: async () => ({ data: artists.find((a) => String(a.name).toLowerCase() === filter?.toLowerCase()) ?? null }),
        insert: (row: Row) => {
          if (table === "artists") {
            const created = { id: `a${artists.length}`, ...row };
            artists.push(created);
            return { select: () => ({ single: async () => ({ data: created }) }) };
          }
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { db: db as any, inserted };
}

function musicBrainzHas(recordings: { artist: string; date: string }[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        recordings: recordings.map((r) => ({
          title: "Alexander's Ragtime Band",
          "artist-credit": [{ name: r.artist }],
          releases: [{ date: r.date, "release-group": { "primary-type": "Single", "secondary-types": [] } }],
        })),
      }),
    })),
  );
}

describe("addLandmarkRecordings", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    process.env.OPENAI_API_KEY = "test";
    process.env.ANTHROPIC_API_KEY = "test";
  });

  async function run(db: any, opts = {}) {
    const p = addLandmarkRecordings(db, "song-1", opts);
    await vi.runAllTimersAsync();
    return p;
  }

  it("adds a recording both models name and MusicBrainz has, after the existing ones", async () => {
    answers.gpt = [{ artist: "Collins and Harlan", year: 1911, why: "original" }, { artist: "Bessie Smith", year: 1927, why: "iconic" }];
    answers.claude = [{ artist: "Arthur Collins and Byron Harlan", year: 1911, why: "original" }];
    musicBrainzHas([{ artist: "Arthur Collins & Byron G. Harlan", date: "1911-05-01" }]);
    const { db, inserted } = fakeDb(["Ray Charles"]);

    const { added } = await run(db);

    expect(added).toEqual([{ artist: "Arthur Collins & Byron G. Harlan", year: 1911 }]);
    expect(inserted).toEqual([{ song_id: "song-1", artist_id: "a1", year: 1911, position: 1 }]);
  });

  it("adds nothing when only one model names a recording", async () => {
    answers.gpt = [{ artist: "Matt Monro", year: 1965, why: "iconic" }];
    answers.claude = [];
    musicBrainzHas([{ artist: "Matt Monro", date: "1965" }]);
    const { db, inserted } = fakeDb(["The Beatles"]);

    expect((await run(db)).added).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("adds nothing MusicBrainz doesn't have", async () => {
    answers.gpt = answers.claude = [{ artist: "Bing Crosby and Connee Boswell", year: 1938, why: "iconic" }];
    musicBrainzHas([]);
    const { db, inserted } = fakeDb(["Ray Charles"]);

    expect((await run(db)).added).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("lists the recording without a year when nothing agrees on one", async () => {
    answers.gpt = [{ artist: "Bessie Smith", year: 1925, why: "iconic" }];
    answers.claude = [{ artist: "Bessie Smith", year: 1927, why: "iconic" }];
    musicBrainzHas([{ artist: "Bessie Smith", date: "" }]);
    const { db, inserted } = fakeDb(["Ray Charles"]);

    expect((await run(db)).added).toEqual([{ artist: "Bessie Smith", year: null }]);
    expect(inserted).toEqual([{ song_id: "song-1", artist_id: "a1", year: null, position: 1 }]);
  });

  it("writes nothing on a dry run", async () => {
    answers.gpt = answers.claude = [{ artist: "Bessie Smith", year: 1927, why: "iconic" }];
    musicBrainzHas([{ artist: "Bessie Smith", date: "1927" }]);
    const { db, inserted } = fakeDb(["Ray Charles"]);

    expect((await run(db, { dryRun: true })).added).toEqual([{ artist: "Bessie Smith", year: 1927 }]);
    expect(inserted).toEqual([]);
  });
});

// Just enough of the Supabase client for addFirstRecordings.
function fakeSongDb(song: Row) {
  const artists: Row[] = [];
  const inserted: Row[] = [];
  const alternates: Row[] = [];
  const db = {
    from(table: string) {
      let filter: string | null = null;
      const q: any = {
        select: () => q,
        eq: () => q,
        ilike: (_: string, v: string) => ((filter = v), q),
        limit: () => q,
        single: async () => ({ data: table === "songs" ? song : null }),
        maybeSingle: async () => ({ data: artists.find((a) => String(a.name).toLowerCase() === filter?.toLowerCase()) ?? null }),
        insert: (row: Row) => {
          if (table === "artists") {
            const created = { id: `a${artists.length}`, ...row };
            artists.push(created);
            return { select: () => ({ single: async () => ({ data: created }) }) };
          }
          inserted.push(row);
          return Promise.resolve({ error: null });
        },
        upsert: async (row: Row) => { alternates.push(row); return { error: null }; },
      };
      return q;
    },
  };
  return { db: db as any, inserted, alternates };
}

// MusicBrainz knows these recordings, each under its own title.
function musicBrainzKnows(recordings: { artist: string; title: string; date: string }[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const q = decodeURIComponent(url);
      const hits = recordings.filter((r) => q.includes(`recording:"${r.title}"`));
      return {
        ok: true,
        status: 200,
        json: async () => ({
          recordings: hits.map((r) => ({
            title: r.title,
            "artist-credit": [{ name: r.artist }],
            releases: [{ date: r.date, "release-group": { "primary-type": "Album", "secondary-types": [] } }],
          })),
        }),
      };
    }),
  );
}

const lowBridge = { title: "Low Bridge, Everybody Down", first_line: null, youtube_url: null, tune_id: null, known_by_recording: null, song_recording_artists: [{ count: 0 }], song_composers: [], song_lyricists: [], song_tags: [] };

describe("addFirstRecordings", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    process.env.OPENAI_API_KEY = "test";
    process.env.ANTHROPIC_API_KEY = "test";
  });

  async function run(db: any, opts = {}) {
    const p = addFirstRecordings(db, "song-1", opts);
    await vi.runAllTimersAsync();
    return p;
  }

  it("adds a recording one model names once MusicBrainz confirms it, under the title on the record", async () => {
    answers.gpt = [{ artist: "Pete Seeger", year: 1957, why: "iconic", recorded_title: "Erie Canal" }];
    answers.claude = [{ artist: "Imaginary Folk Trio", year: 1960, why: "iconic", recorded_title: "Low Bridge" }];
    musicBrainzKnows([{ artist: "Pete Seeger", title: "Erie Canal", date: "1958-01-01" }]);
    const { db, inserted, alternates } = fakeSongDb(lowBridge);

    const { added } = await run(db);

    expect(added).toEqual([{ artist: "Pete Seeger", year: 1958, title: "Erie Canal" }]);
    expect(inserted).toEqual([{ song_id: "song-1", artist_id: "a0", year: 1958, position: 1, recorded_title: "Erie Canal", spotify_url: null }]);
    expect(alternates).toEqual([{ song_id: "song-1", title: "Erie Canal" }]);
  });

  it("stops at two recordings, those both models name first", async () => {
    answers.gpt = [{ artist: "The Weavers", year: 1951, why: "iconic", recorded_title: "Erie Canal" }, { artist: "Pete Seeger", year: 1957, why: "iconic", recorded_title: "Erie Canal" }];
    answers.claude = [{ artist: "Pete Seeger", year: 1957, why: "iconic", recorded_title: "Erie Canal" }, { artist: "Bruce Springsteen", year: 2006, why: "iconic", recorded_title: "Erie Canal" }];
    musicBrainzKnows(["The Weavers", "Pete Seeger", "Bruce Springsteen"].map((artist) => ({ artist, title: "Erie Canal", date: "" })));
    const { db } = fakeSongDb(lowBridge);

    expect((await run(db, { dryRun: true })).added.map((a: any) => a.artist)).toEqual(["Pete Seeger", "The Weavers"]);
  });

  it("leaves a song marked as not known by a recording alone", async () => {
    answers.gpt = answers.claude = [{ artist: "George Harrison", year: 1982, why: "original", recorded_title: "That's the Way It Goes" }];
    const { db, inserted } = fakeSongDb({ ...lowBridge, title: "That's the Way It Goes", known_by_recording: false });

    expect((await run(db)).added).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it("leaves a song that names its tune alone", async () => {
    answers.gpt = answers.claude = [{ artist: "Westminster Abbey Choir", year: 2020, why: "iconic", recorded_title: "Love Divine" }];
    const { db, inserted } = fakeSongDb({ ...lowBridge, title: "Love Divine, All Loves Excelling", tune_id: "blaenwern" });

    expect((await run(db)).added).toEqual([]);
    expect(inserted).toEqual([]);
  });
});
