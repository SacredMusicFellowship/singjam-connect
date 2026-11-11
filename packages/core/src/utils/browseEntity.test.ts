import { describe, expect, it } from "vitest";
import { loadBrowseEntity, loadBrowseRelated, loadBrowseSongs, loadSongFilterMeta, tagSongIds, traditionalCultureChips } from "./browseEntity";

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

describe("traditionalCultureChips", () => {
  it("counts each culture once per song, most songs first, linking to its traditional songs", () => {
    expect(traditionalCultureChips([{ cultures: ["Irish", "Scottish"] }, { cultures: ["Irish", "Irish"] }, { cultures: [] }])).toEqual([
      { label: "Irish", count: 2, href: "/cultures/Irish/traditional" },
      { label: "Scottish", count: 1, href: "/cultures/Scottish/traditional" },
    ]);
  });
});

// Each table answers with fixed rows; maybeSingle gives the first.
function fakeDb(tables: Record<string, any[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const q: any = {
        select: () => q, order: () => q, eq: () => q, not: () => q,
        in: (col: string, vals: unknown[]) => { rows = rows.filter((r) => vals.includes(r[col])); return q; },
        range: async () => ({ data: rows, error: null }),
        maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  };
}

describe("loadBrowseEntity facts", () => {
  it("labels a tune's writers by role, origin, date with its first printing, and meter", async () => {
    const db = fakeDb({
      tunes: [{
        id: "t", slug: "kingsfold", tune_label: "Kingsfold", meter: "CMD", year: 1906, year_precision: "exact", published_in: "The English Hymnal", notes: null,
        tune_credits: [{ role: "arranger", people: { name: "Ralph Vaughan Williams", slug: "rvw" } }, { role: "composer", people: { name: "Traditional", slug: "traditional" } }],
        tune_tags: [{ tags: { name: "English", slug: "english", type: "culture" } }, { tags: { name: "Dorian", slug: "dorian", type: "mode" } }],
      }],
      songs: [{ id: "s1" }],
    });
    const e = await loadBrowseEntity(db, "tune", "kingsfold");
    expect(e?.facts).toEqual([
      { label: "Music", groups: [[{ text: "Traditional", link: { kind: "person", key: "traditional" } }, { lead: "arr. ", text: "Ralph Vaughan Williams", link: { kind: "person", key: "rvw" } }]] },
      { label: "Origin", groups: [[{ text: "English", link: { kind: "culture", key: "english" } }]] },
      { label: "Date", groups: [[{ text: "1906", link: null }], [{ lead: "first printed in ", text: "The English Hymnal", link: null }]] },
      { label: "Meter", groups: [[{ text: "CMD", link: null }]] },
    ]);
    expect(e?.related.map((t) => t.name)).toEqual(["Dorian"]);
  });

  it("lists a text's sources in order and drops a language the culture already names", async () => {
    const db = fakeDb({
      texts: [{
        id: "x", title: "Etz Chayim Hi", year: 1550, year_precision: "century", notes: null, text_credits: [],
        text_sources: [
          { id: "c", corpus: "tanakh", book: "Lamentations", chapter_start: 5, verse_start: 21, relation: "quoted" },
          { id: "a", corpus: "tanakh", book: "Proverbs", chapter_start: 3, verse_start: 18, relation: "quoted" },
          { id: "b", corpus: "tanakh", book: "Proverbs", chapter_start: 3, verse_start: 17, relation: "quoted" },
        ],
        text_tags: [{ tags: { name: "Jewish", slug: "jewish", type: "community" } }, { tags: { name: "Hebrew", slug: "hebrew", type: "language" } }],
      }],
      songs: [{ id: "s1" }],
    });
    const e = await loadBrowseEntity(db, "text", "etz-chayim-hi");
    expect(e?.facts?.map((l) => `${l.label}: ${l.groups.map((g) => g.map((c) => c.text).join(", ")).join(" · ")}`)).toEqual([
      "Origin: Jewish", "Date: 16th c.", "Sources: Proverbs 3:17 · Proverbs 3:18 · Lamentations 5:21", "Language: Hebrew",
    ]);
    expect(e?.facts?.[2].groups[0][0].link).toEqual({ kind: "scripture", key: "proverbs/3" });
  });
});

describe("loadBrowseEntity scripture", () => {
  const db = fakeDb({
    text_sources: [
      { id: "1", text_id: "watts", corpus: "tanakh", book: "Psalms", chapter_start: 90, verse_start: null, relation: "metrical" },
      { id: "2", text_id: "hinei", corpus: "tanakh", book: "Psalms", chapter_start: 133, verse_start: 1, relation: "quoted" },
    ],
    songs: [{ id: "s1", text_id: "watts", tune_id: "st-anne" }, { id: "s2", text_id: "hinei", tune_id: null }],
  });
  it("lists a chapter's settings with a link to read it", async () => {
    const e = await loadBrowseEntity(db, "scripture", "psalms/90");
    expect(e?.name).toBe("Psalm 90");
    expect(e?.songIds).toEqual(["s1"]);
    expect(e?.roles.get("s1")).toBe("After Psalm 90");
    expect(e?.readUrl?.href).toBe("https://www.sefaria.org/Psalms.90?lang=bi");
    expect(e?.parents).toEqual([{ name: "Psalms", slug: "psalms", type: "scripture" }]);
  });
  it("lists a book's chapters and leaves the passage off cards that already show it", async () => {
    const e = await loadBrowseEntity(db, "scripture", "psalms");
    expect(e?.children.map((c) => c.slug)).toEqual(["psalms/90", "psalms/133"]);
    expect(e?.roles.has("s2")).toBe(false);
    expect(await loadBrowseEntity(db, "scripture", "masnavi")).toBeNull();
  });
});

// An rpc call that records its arguments and pages its rows by range.
function rpcDb(rows: Record<string, any[] | ((args: any) => any[])>) {
  const calls: { fn: string; args: any }[] = [];
  return {
    calls,
    rpc(fn: string, args: any) {
      calls.push({ fn, args });
      const all = typeof rows[fn] === "function" ? (rows[fn] as (a: any) => any[])(args) : (rows[fn] as any[]) ?? [];
      const q: any = {
        select: () => q, order: () => q,
        range: async (f: number, t: number) => ({ data: all.slice(f, t + 1), error: null }),
        then: (res: any, rej: any) => Promise.resolve({ data: all, error: null }).then(res, rej),
      };
      return q;
    },
  };
}

describe("tagSongIds", () => {
  it("asks tag_song_pairs for the tag and pages through every song", async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => ({ song_id: `s${i}` }));
    const db = rpcDb({ tag_song_pairs: ids });
    const out = await tagSongIds(db, "t1");
    expect(out).toHaveLength(1500);
    expect(db.calls.map((c) => c.args)).toEqual([{ p_tag_ids: ["t1"] }, { p_tag_ids: ["t1"] }]);
  });
});

describe("loadSongFilterMeta", () => {
  it("asks for just these songs, or every song when none are given", async () => {
    const db = rpcDb({ song_filter_meta: [{ song_id: "a" }] });
    await loadSongFilterMeta(db, ["a", "b"]);
    await loadSongFilterMeta(db);
    expect(db.calls.map((c) => c.args)).toEqual([{ p_song_ids: ["a", "b"] }, {}]);
  });

  it("skips the call for an empty list", async () => {
    const db = rpcDb({});
    expect(await loadSongFilterMeta(db, [])).toEqual([]);
    expect(db.calls).toEqual([]);
  });
});

describe("loadBrowseSongs", () => {
  it("asks for every 200-song page at once and keeps them in order", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => `s${i}`);
    const db = rpcDb({
      browse_songs: (a) => ids.slice(a.p_offset, a.p_offset + a.p_limit).map((song_id) => ({ song_id })),
      members_knowing: () => 7 as any,
    });
    const { songs, members } = await loadBrowseSongs(db, ids);
    expect(songs.map((s) => s.song_id)).toEqual(ids);
    expect(members).toBe(7);
    expect(db.calls.filter((c) => c.fn === "browse_songs").map((c) => c.args.p_offset)).toEqual([0, 200, 400]);
  });
});
