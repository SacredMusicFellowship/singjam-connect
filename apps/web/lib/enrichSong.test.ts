import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const answers = vi.hoisted(() => ({ gpt: {} as Record<string, unknown>, claude: {} as Record<string, unknown> }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: async () => ({ model: "gpt", usage: {}, choices: [{ message: { content: JSON.stringify({ fields: answers.gpt }) } }] }) } };
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
          content: [{ type: "text", text: JSON.stringify({ fields: answers.claude }) }],
        }),
      },
    };
  },
}));

import { enrichSong } from "./songEnrichment";

type Row = Record<string, unknown>;
const hi = (v: unknown) => ({ v, c: "high" });

// A song with everything filled in except its production and alternate titles.
const allTags = ["genre", "theme", "language", "culture", "form", "occasion", "community"].map((type) => ({ context: "general", tags: { type } }));

function fakeDb(songTags: Row[] = allTags) {
  const writes: { table: string; row: Row | Row[] }[] = [];
  const song = {
    id: "song-1", title: "Cups (When I'm Gone)", display_artist: "Anna Kendrick", year_written: 1931, tonality: "Major", meter: "4", vibe: "Ballad",
    first_line: "x", hook: "y", song_composers: [{ count: 1 }], song_lyricists: [{ count: 1 }], song_tags: songTags,
    song_productions: [], song_alternate_titles: [{ count: 0 }],
    song_recording_artists: [{ artist_id: "a1", year: 2012, position: 0, artists: { name: "Anna Kendrick" } }],
  };
  const db = {
    from(table: string) {
      let names: string[] = [];
      const q: any = {
        select: () => q,
        in: (_col: string, values: string[]) => { names = values; return q; },
        upsert: (row: Row | Row[]) => { writes.push({ table, row }); return Promise.resolve({ error: null }); },
        eq: () => q,
        ilike: () => q,
        limit: () => q,
        single: async () => ({ data: table === "songs" ? song : null }),
        maybeSingle: async () => ({ data: null }),
        update: () => q,
        then: (resolve: (v: unknown) => void) =>
          resolve({ error: null, data: table === "tags" ? names.map((name) => ({ id: `tag:${name}`, name })) : null }),
        insert: (row: Row | Row[]) => {
          writes.push({ table, row });
          if (table === "productions") return { select: () => ({ single: async () => ({ data: { id: "p1" } }) }) };
          return Promise.resolve({ error: null });
        },
      };
      return q;
    },
  };
  return { db: db as any, writes };
}

beforeEach(() => {
  vi.stubEnv("OPENAI_API_KEY", "k");
  vi.stubEnv("ANTHROPIC_API_KEY", "k");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("enrichSong — productions and alternate titles", () => {
  it("adds what both models name, skipping the song's own title", async () => {
    answers.gpt = { productions: hi(["Pitch Perfect"]), alternate_titles: hi(["Cups"]) };
    answers.claude = { productions: hi(["Pitch Perfect"]), alternate_titles: hi(["Cups", "Cups (When I'm Gone)"]) };
    const { db, writes } = fakeDb();

    await enrichSong(db, "song-1");

    expect(writes).toContainEqual({ table: "productions", row: { name: "Pitch Perfect", year: null } });
    expect(writes).toContainEqual({ table: "song_productions", row: { song_id: "song-1", production_id: "p1" } });
    expect(writes).toContainEqual({ table: "song_alternate_titles", row: [{ song_id: "song-1", title: "Cups" }] });
  });

  it("adds nothing only one source names", async () => {
    answers.gpt = { productions: hi(["Glee"]), alternate_titles: hi(["Cups"]) };
    answers.claude = { productions: hi([]), alternate_titles: hi([]) };
    const { db, writes } = fakeDb();

    await enrichSong(db, "song-1");

    expect(writes.filter((w) => ["productions", "song_productions", "song_alternate_titles"].includes(w.table))).toEqual([]);
  });
});

describe("enrichSong — forms, occasions and communities", () => {
  it("tags what both models name when the song has none of that type yet", async () => {
    answers.gpt = { forms: hi(["Hymn"]), communities: hi(["Christian", "Black Church (US)"]), occasions: hi(["Wedding"]) };
    answers.claude = { forms: hi(["Hymn"]), communities: hi(["Christian"]), occasions: hi(["Funeral and memorial"]) };
    const { db, writes } = fakeDb(allTags.filter((t) => !["form", "community", "occasion"].includes((t.tags as Row).type as string)));

    await enrichSong(db, "song-1");

    const tagged = writes.filter((w) => w.table === "song_tags").flatMap((w) => w.row as Row[]).map((r) => r.tag_id);
    expect(tagged).toEqual(["tag:Hymn", "tag:Christian"]);
  });
});
