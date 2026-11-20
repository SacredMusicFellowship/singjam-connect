import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const answers = vi.hoisted(() => ({ gpt: {} as Record<string, unknown>, claude: {} as Record<string, unknown>, claudeSchemas: [] as any[] }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: async () => ({ model: "gpt", usage: {}, choices: [{ message: { content: JSON.stringify({ fields: answers.gpt }) } }] }) } };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: async (req: any) => (answers.claudeSchemas.push(req.output_config?.format?.schema), {
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

function fakeDb(songTags: Row[] = allTags, over: Row = {}) {
  const writes: { table: string; row: Row | Row[] }[] = [];
  const song = {
    id: "song-1", title: "Cups (When I'm Gone)", display_artist: "Anna Kendrick", year_written: 1931, tonality: "Major", meter: "4", vibe: "Ballad",
    first_line: "x", hook: "y", song_composers: [{ count: 1 }], song_lyricists: [{ count: 1 }], song_tags: songTags,
    notes: null, genius_url: null, song_productions: [], song_alternate_titles: [],
    song_recording_artists: [{ artist_id: "a1", year: 2012, position: 0, artists: { name: "Anna Kendrick" } }],
    ...over,
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
        update: (row: Row) => { writes.push({ table, row }); return q; },
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

describe("enrichSong — asking Claude", () => {
  it("asks about a new song's fields in parts small enough for Claude's schema, and uses every part's answers", async () => {
    answers.claudeSchemas = [];
    answers.gpt = { alternate_titles: hi(["Cups"]) };
    answers.claude = { alternate_titles: hi(["Cups"]) };
    const { db, writes } = fakeDb([], { year_written: null, tonality: null, meter: null, vibe: null, first_line: null, hook: null, song_composers: [], song_lyricists: [] });

    await enrichSong(db, "song-1");

    const fieldCalls = answers.claudeSchemas.filter((s) => s?.properties?.fields);
    const asked = fieldCalls.map((s) => s.properties.fields.required as string[]);
    expect(asked.length).toBeGreaterThan(1);
    expect(asked.every((f) => f.length <= 11)).toBe(true);
    expect(asked.flat()).toContain("alternate_titles");
    expect(writes).toContainEqual({ table: "song_alternate_titles", row: [{ song_id: "song-1", title: "Cups" }] });
  });
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

describe("enrichSong — notes", () => {
  const notesWrite = (writes: { table: string; row: Row | Row[] }[]) =>
    writes.find((w) => w.table === "songs" && "notes" in (w.row as Row))?.row as Row | undefined;

  it("fills empty notes from a model and marks them AI-written", async () => {
    answers.gpt = { notes: hi("Written for the film.") };
    answers.claude = {};
    const { db, writes } = fakeDb();

    await enrichSong(db, "song-1");

    expect(notesWrite(writes)).toMatchObject({ notes: "Written for the film.", notes_source: "ai" });
  });

  it("never replaces notes the song already has", async () => {
    answers.gpt = { notes: hi("Written for the film.") };
    answers.claude = {};
    const { db, writes } = fakeDb(allTags, { notes: "A person wrote this." });

    await enrichSong(db, "song-1");

    expect(notesWrite(writes)).toBeUndefined();
  });
});
