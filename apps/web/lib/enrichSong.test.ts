import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const answers = vi.hoisted(() => ({ gpt: {} as Record<string, unknown>, claude: {} as Record<string, unknown>, claudeSchemas: [] as any[], claudePrompts: [] as string[], gptEfforts: [] as string[] }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: async (req: any) => (answers.gptEfforts.push(req.reasoning_effort), { model: "gpt", usage: {}, choices: [{ message: { content: JSON.stringify({ fields: answers.gpt }) } }] }) } };
  },
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    beta = {
      messages: {
        create: async (req: any) => (answers.claudeSchemas.push(req.output_config?.format?.schema), answers.claudePrompts.push(req.messages?.[0]?.content ?? ""), {
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
        neq: () => q,
        delete: () => { writes.push({ table, row: { deleted: true } }); return q; },
        ilike: () => q,
        order: () => q,
        limit: () => q,
        single: async () => ({ data: table === "songs" ? song : null }),
        maybeSingle: async () => ({ data: null }),
        update: (row: Row) => { writes.push({ table, row }); return q; },
        then: (resolve: (v: unknown) => void) =>
          resolve({ error: null, data: table === "tags" ? names.map((name) => ({ id: `tag:${name}`, name })) : null }),
        insert: (row: Row | Row[]) => {
          writes.push({ table, row });
          if (table === "productions") return { select: () => ({ single: async () => ({ data: { id: "p1" } }) }) };
          const id = Array.isArray(row) ? null : `${table}:${(row as Row).name ?? (row as Row).title ?? "new"}`;
          return Object.assign(Promise.resolve({ error: null }), { select: () => ({ single: async () => ({ data: { id }, error: null }) }) });
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

  it("asks GPT the song's fields without reasoning, and keeps reasoning for the recordings question", async () => {
    answers.gptEfforts = [];
    answers.gpt = {};
    answers.claude = {};
    const { db } = fakeDb();

    await enrichSong(db, "song-1");

    expect(answers.gptEfforts[0]).toBe("none");
    expect(answers.gptEfforts.slice(1)).toEqual(["low"]);
  });
});

describe("enrichSong — a traditional song's recording", () => {
  it("names the recording artist as one version rather than beside the title", async () => {
    answers.claudePrompts = [];
    answers.gpt = {};
    answers.claude = {};
    const { db } = fakeDb(allTags, { title: "Harbour Carol", song_composers: [{ people: { name: "Traditional" } }], song_lyricists: [] });

    await enrichSong(db, "song-1");

    const fields = answers.claudePrompts.find((p) => p.includes("Fill these fields"))!;
    expect(fields).toContain('Song: "Harbour Carol"\n');
    expect(fields).toContain("Anna Kendrick's recording is one version of it, so describe the song itself.");
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

describe("enrichSong — a hymn added in lower case", () => {
  const csv = (rows: string) => ({ ok: true, text: async () => rows });
  const TEXTS = `displayTitle,firstLine,textTitle,refrainFirstLine,textAuthNumber,languages,authors,meter,textSources,totalInstances
"Harbour Canticle","Lights along the harbour, shining through the night","Harbour Canticle",,lights_along_the_harbour,English,"Ada Quillfeather",,,12
`;
  const TUNES = `tuneTitle,tuneAuthNumber,composers,tuneKey,incipit,meter,tuneSources,totalInstances
"STAR OF THE QUAY",star_of_the_quay,"Ada Quillfeather","e minor",1,Irregular,"Welsh melody",20
`;

  it("takes the hymnal's title casing, links its text and tune, and gives the tune its origin", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("hymnary.org") && url.includes("in%3Atexts")) return csv(TEXTS);
      if (url.includes("hymnary.org") && url.includes("in%3Atunes")) return csv(TUNES);
      throw new Error("offline");
    }));
    answers.gpt = { lyricists: hi(["Ada Quillfeather"]) };
    answers.claude = { lyricists: hi(["Ada Quillfeather"]) };
    const { db, writes } = fakeDb(allTags.filter((t) => (t.tags as Row).type !== "culture"), {
      title: "harbour canticle", display_artist: null, song_recording_artists: [], first_line: null, tonality: null,
      song_composers: [], song_lyricists: [], text_id: null, tune_id: null,
    });

    await enrichSong(db, "song-1");

    const songWrites = writes.filter((w) => w.table === "songs").map((w) => w.row as Row);
    expect(songWrites).toContainEqual(expect.objectContaining({ title: "Harbour Canticle", tonality: "Minor" }));
    expect(writes).toContainEqual({ table: "texts", row: { title: "Harbour Canticle", slug: "x", kind: "hymn", first_line: "Lights along the harbour, shining through the night" } });
    expect(writes).toContainEqual({ table: "tunes", row: { name: "Star of the Quay", slug: "x", meter: "Irregular" } });
    expect(writes).toContainEqual({ table: "tune_credits", row: [
      { tune_id: "tunes:Star of the Quay", person_id: "people:Traditional", role: "composer" },
      { tune_id: "tunes:Star of the Quay", person_id: "people:Ada Quillfeather", role: "arranger" },
    ] });
    expect(writes).toContainEqual({ table: "tune_tags", row: [{ tune_id: "tunes:Star of the Quay", tag_id: "tag:Welsh" }] });
    expect(songWrites).toContainEqual({ text_id: "texts:Harbour Canticle", tune_id: "tunes:Star of the Quay" });
    expect(writes).toContainEqual({ table: "song_tags", row: { song_id: "song-1", tag_id: "tag:Welsh", context: "music" } });
  });

  it("leaves a song that already has a tune as it is", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("in%3Atexts")) return csv(TEXTS);
      if (url.includes("in%3Atunes")) return csv(TUNES);
      throw new Error("offline");
    }));
    answers.gpt = { lyricists: hi(["Ada Quillfeather"]) };
    answers.claude = { lyricists: hi(["Ada Quillfeather"]) };
    const { db, writes } = fakeDb(allTags, { title: "Harbour Canticle", first_line: null, song_composers: [], song_lyricists: [], text_id: "t1", tune_id: "u1" });

    await enrichSong(db, "song-1");

    expect(writes.filter((w) => ["texts", "tunes", "tune_credits"].includes(w.table))).toEqual([]);
  });
});
