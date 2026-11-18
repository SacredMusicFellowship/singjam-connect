import { describe, it, expect } from "vitest";
import { reportChart, reviewChart, setChartAsEditor, submitChart, ChartError } from "./chordCharts";

// A tiny in-memory stand-in for the few PostgREST calls chordCharts makes.
function fakeDb(seed: { songs: any[]; subs?: any[] }) {
  const tables: Record<string, any[]> = { songs: seed.songs, chord_chart_submissions: seed.subs ?? [] };
  let nextId = 1;
  const query = (table: string) => {
    const filters: ((r: any) => boolean)[] = [];
    let orderCol: string | null = null, asc = true;
    const rows = () => {
      let r = tables[table].filter((x) => filters.every((f) => f(x)));
      if (orderCol) r = [...r].sort((a, b) => (a[orderCol!] > b[orderCol!] ? 1 : -1) * (asc ? 1 : -1));
      return r;
    };
    const chain: any = {
      select: () => chain,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), chain),
      neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), chain),
      order: (c: string, o?: { ascending?: boolean }) => ((orderCol ??= c), (asc = o?.ascending ?? asc), chain),
      limit: () => chain,
      maybeSingle: async () => ({ data: rows()[0] ?? null }),
    };
    return chain;
  };
  return {
    tables,
    from: (table: string) => ({
      select: () => query(table).select(),
      insert: async (row: any) => {
        tables[table].push({ id: `sub-${nextId++}`, status: "pending", created_at: new Date(Date.now() + nextId).toISOString(), reviewed_at: null, ...row });
        return { error: null };
      },
      update: (vals: any) => ({
        eq: async (c: string, v: any) => {
          tables[table].filter((r) => r[c] === v).forEach((r) => Object.assign(r, vals));
          return { error: null };
        },
      }),
    }),
  } as any;
}

const UG = "https://tabs.ultimate-guitar.com/tab/x/y-chords-1";
const UG2 = "https://tabs.ultimate-guitar.com/tab/x/y-chords-2";

describe("submitChart", () => {
  it("puts a chart live as unreviewed on a song without one", async () => {
    const db = fakeDb({ songs: [{ id: "s1", chord_chart_url: null, chord_chart_pending: false }] });
    expect(await submitChart(db, "s1", UG, "u1")).toEqual({ live: true });
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: UG, chord_chart_pending: true });
    expect(db.tables.chord_chart_submissions[0]).toMatchObject({ url: UG, submitted_by: "u1", status: "pending" });
  });

  it("holds a replacement for an approved chart until it's reviewed", async () => {
    const db = fakeDb({ songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: false }] });
    expect(await submitChart(db, "s1", UG2, "u1")).toEqual({ live: false });
    expect(db.tables.songs[0].chord_chart_url).toBe(UG);
  });

  it("refuses anything that isn't an Ultimate Guitar tab", async () => {
    const db = fakeDb({ songs: [{ id: "s1", chord_chart_url: null, chord_chart_pending: false }] });
    await expect(submitChart(db, "s1", "https://example.com/chart.png", "u1")).rejects.toBeInstanceOf(ChartError);
  });
});

describe("reviewChart", () => {
  const seed = () => fakeDb({
    songs: [{ id: "s1", chord_chart_url: UG2, chord_chart_pending: true }],
    subs: [
      { id: "old", song_id: "s1", url: UG, submitted_by: null, status: "approved", reviewed_at: "2026-01-01", created_at: "2026-01-01" },
      { id: "new", song_id: "s1", url: UG2, submitted_by: "u1", status: "pending", reviewed_at: null, created_at: "2026-11-01" },
    ],
  });

  it("approving makes the chart reviewed", async () => {
    const db = seed();
    await reviewChart(db, "new", { id: "ed", role: "song_editor" }, "approve");
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: UG2, chord_chart_pending: false });
    expect(db.tables.chord_chart_submissions[1]).toMatchObject({ status: "approved", reviewed_by: "ed" });
  });

  it("rejecting the live chart puts the last approved one back", async () => {
    const db = seed();
    await reviewChart(db, "new", { id: "ed", role: "admin" }, "reject");
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: UG, chord_chart_pending: false });
  });

  it("a replacement goes up unreviewed, for someone else to check", async () => {
    const db = seed();
    const UG3 = "https://tabs.ultimate-guitar.com/tab/x/y-chords-3";
    await reviewChart(db, "new", { id: "ed", role: "song_editor" }, "replace", UG3);
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: UG3, chord_chart_pending: true });
    expect(db.tables.chord_chart_submissions.at(-1)).toMatchObject({ url: UG3, submitted_by: "ed", status: "pending" });
  });

  it("rejecting the live chart with nothing approved puts the newest waiting chart up, unreviewed", async () => {
    const UG3 = "https://tabs.ultimate-guitar.com/tab/x/y-chords-3";
    const db = fakeDb({
      songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: true }],
      subs: [
        { id: "live", song_id: "s1", url: UG, submitted_by: "u1", status: "pending", created_at: "2026-11-01" },
        { id: "waiting", song_id: "s1", url: UG3, submitted_by: "u2", status: "pending", created_at: "2026-11-02" },
      ],
    });
    await reviewChart(db, "live", { id: "ed", role: "song_editor" }, "reject");
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: UG3, chord_chart_pending: true });
  });

  it("rejecting the only chart takes it down", async () => {
    const db = fakeDb({
      songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: true }],
      subs: [{ id: "live", song_id: "s1", url: UG, submitted_by: "u1", status: "pending", created_at: "2026-11-01" }],
    });
    await reviewChart(db, "live", { id: "ed", role: "song_editor" }, "reject");
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: null, chord_chart_pending: false });
  });

  it("reports a failed write instead of succeeding", async () => {
    const db = seed();
    const from = db.from;
    db.from = (t: string) => (t === "songs" ? { ...from(t), update: () => ({ eq: async () => ({ error: { message: "boom" } }) }) } : from(t));
    await expect(reviewChart(db, "new", { id: "ed", role: "admin" }, "approve")).rejects.toMatchObject({ status: 500 });
  });

  it("won't let anyone review their own chart, or a member review at all", async () => {
    const db = seed();
    await expect(reviewChart(db, "new", { id: "u1", role: "song_editor" }, "approve")).rejects.toMatchObject({ status: 403 });
    await expect(reviewChart(db, "new", { id: "m", role: "member" }, "approve")).rejects.toMatchObject({ status: 403 });
  });
});

describe("reportChart", () => {
  it("sends the live chart back to review with the note", async () => {
    const db = fakeDb({
      songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: false }],
      subs: [{ id: "a", song_id: "s1", url: UG, submitted_by: null, status: "approved", created_at: "2026-01-01" }],
    });
    await reportChart(db, "s1", "wrong key");
    expect(db.tables.songs[0].chord_chart_pending).toBe(true);
    expect(db.tables.chord_chart_submissions[0]).toMatchObject({ status: "pending", note: "Reported: wrong key" });
  });
});

describe("setChartAsEditor", () => {
  it("records an editor's new chart as approved by them and puts it live", async () => {
    const db = fakeDb({ songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: false }] });
    await setChartAsEditor(db, "s1", ` ${UG2} `, "ed");
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: UG2, chord_chart_pending: false });
    expect(db.tables.chord_chart_submissions[0]).toMatchObject({ url: UG2, submitted_by: "ed", status: "approved", reviewed_by: "ed" });
  });

  it("approves a waiting submission of the same link instead of adding another", async () => {
    const db = fakeDb({
      songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: true }],
      subs: [{ id: "w", song_id: "s1", url: UG, submitted_by: "u1", status: "pending", created_at: "2026-11-01" }],
    });
    await setChartAsEditor(db, "s1", UG, "ed");
    expect(db.tables.chord_chart_submissions).toHaveLength(1);
    expect(db.tables.chord_chart_submissions[0]).toMatchObject({ status: "approved", reviewed_by: "ed" });
    expect(db.tables.songs[0].chord_chart_pending).toBe(false);
  });

  it("does nothing when the approved chart is unchanged", async () => {
    const db = fakeDb({ songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: false }] });
    await setChartAsEditor(db, "s1", UG, "ed");
    expect(db.tables.chord_chart_submissions).toHaveLength(0);
  });

  it("takes the chart down when cleared", async () => {
    const db = fakeDb({ songs: [{ id: "s1", chord_chart_url: UG, chord_chart_pending: true }] });
    await setChartAsEditor(db, "s1", "", "ed");
    expect(db.tables.songs[0]).toMatchObject({ chord_chart_url: null, chord_chart_pending: false });
  });

  it("refuses anything that isn't an Ultimate Guitar tab", async () => {
    const db = fakeDb({ songs: [{ id: "s1", chord_chart_url: null, chord_chart_pending: false }] });
    await expect(setChartAsEditor(db, "s1", "https://example.com/x", "ed")).rejects.toMatchObject({ status: 400 });
  });
});
