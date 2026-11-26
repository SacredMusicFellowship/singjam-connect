import { describe, it, expect } from "vitest";
import { canReviewChart, chartLink, isScoreUrl, isUltimateGuitarChartUrl, newChartGoesLive, scoreSiteName, sortChartQueue, type ChartQueueRow } from "./chordCharts";

describe("scoreSiteName", () => {
  it("names the score sites we accept", () => {
    expect(scoreSiteName("https://dilbeyti.com/en/besteler/690")).toBe("Dil Beyti");
    expect(scoreSiteName("https://hymnary.org/tune/gloria_french")).toBe("Hymnary");
    expect(scoreSiteName("https://imslp.org/wiki/Messiah,_HWV_56_(Handel,_George_Frideric)")).toBe("IMSLP");
    expect(scoreSiteName("https://www.cpdl.org/wiki/index.php/Ave_verum_corpus")).toBe("CPDL");
    expect(scoreSiteName("https://musescore.com/user/1/scores/2")).toBe("MuseScore");
    expect(scoreSiteName("https://example.org/files/Amazing-Grace.PDF")).toBe("PDF");
  });
  it("rejects other sites, look-alikes, bare homepages and non-web links", () => {
    expect(scoreSiteName("https://tabs.ultimate-guitar.com/tab/x")).toBeNull();
    expect(scoreSiteName("https://dilbeyti.com.evil.example/en/besteler/1")).toBeNull();
    expect(scoreSiteName("https://dilbeyti.com/")).toBeNull();
    expect(scoreSiteName("javascript:alert(1)//x.pdf")).toBeNull();
    expect(scoreSiteName("not a url")).toBeNull();
    expect(isScoreUrl("https://drive.google.com/file/d/abc/view")).toBe(false);
  });
});

describe("chartLink", () => {
  it("prefers chords, falls back to the score, else nothing", () => {
    expect(chartLink("https://tabs.ultimate-guitar.com/tab/x", "https://hymnary.org/tune/y")).toEqual({ kind: "chords", url: "https://tabs.ultimate-guitar.com/tab/x" });
    expect(chartLink(null, "https://dilbeyti.com/en/besteler/690")).toEqual({ kind: "score", url: "https://dilbeyti.com/en/besteler/690" });
    expect(chartLink(undefined, "")).toBeNull();
  });
});

describe("isUltimateGuitarChartUrl", () => {
  it("accepts Ultimate Guitar tab pages", () => {
    expect(isUltimateGuitarChartUrl("https://tabs.ultimate-guitar.com/tab/bill-withers/lean-on-me-chords-80342")).toBe(true);
    expect(isUltimateGuitarChartUrl(" https://www.ultimate-guitar.com/tab/x ")).toBe(true);
  });
  it("rejects everything else", () => {
    expect(isUltimateGuitarChartUrl("https://encrypted-tbn0.gstatic.com/images?q=tbn")).toBe(false);
    expect(isUltimateGuitarChartUrl("https://ultimate-guitar.com.evil.example/tab/x")).toBe(false);
    expect(isUltimateGuitarChartUrl("https://tabs.ultimate-guitar.com/")).toBe(false);
    expect(isUltimateGuitarChartUrl("javascript:alert(1)")).toBe(false);
    expect(isUltimateGuitarChartUrl("not a url")).toBe(false);
  });
});

describe("canReviewChart", () => {
  it("lets admins review their own charts", () => {
    expect(canReviewChart({ id: "a", role: "admin" }, "a")).toBe(true);
  });
  it("lets song editors and admins review other people's charts", () => {
    expect(canReviewChart({ id: "a", role: "song_editor" }, "b")).toBe(true);
    expect(canReviewChart({ id: "a", role: "admin" }, null)).toBe(true);
  });
  it("never their own, and never members", () => {
    expect(canReviewChart({ id: "a", role: "song_editor" }, "a")).toBe(false);
    expect(canReviewChart({ id: "a", role: "member" }, "b")).toBe(false);
  });
});

describe("newChartGoesLive", () => {
  it("goes live when there's no chart or only an unreviewed one", () => {
    expect(newChartGoesLive({ chord_chart_url: null, chord_chart_pending: false })).toBe(true);
    expect(newChartGoesLive({ chord_chart_url: "u", chord_chart_pending: true })).toBe(true);
  });
  it("waits for review rather than replacing an approved chart", () => {
    expect(newChartGoesLive({ chord_chart_url: "u", chord_chart_pending: false })).toBe(false);
  });
});

describe("sortChartQueue", () => {
  const rows: ChartQueueRow[] = [
    { id: "a", createdAt: "2026-11-03", songTitle: "jolene", adder: "Zoe", reportedAt: null },
    { id: "b", createdAt: "2026-11-01", songTitle: "Amazing Grace", adder: null, reportedAt: "2026-11-10" },
    { id: "c", createdAt: "2026-11-02", songTitle: "Banks of the Ohio", adder: "ava", reportedAt: "2026-11-12" },
    { id: "d", createdAt: "2026-11-02", songTitle: "Wayfaring Stranger", adder: "Mo", reportedAt: null },
  ];
  const ids = (sorted: ChartQueueRow[]) => sorted.map((r) => r.id).join("");

  it("sorts by date added, ties by id", () => {
    expect(ids(sortChartQueue(rows, "added", "asc"))).toBe("bcda");
    expect(ids(sortChartQueue(rows, "added", "desc"))).toBe("acdb");
  });

  it("sorts by song title, ignoring case", () => {
    expect(ids(sortChartQueue(rows, "song", "asc"))).toBe("bcad");
    expect(ids(sortChartQueue(rows, "song", "desc"))).toBe("dacb");
  });

  it("sorts by who added it, with no adder last either way", () => {
    expect(ids(sortChartQueue(rows, "adder", "asc"))).toBe("cdab");
    expect(ids(sortChartQueue(rows, "adder", "desc"))).toBe("adcb");
  });

  it("puts reported charts first, the latest report first", () => {
    expect(ids(sortChartQueue(rows, "reported", "desc"))).toBe("cbda");
  });

  it("leaves the input alone", () => {
    sortChartQueue(rows, "song", "asc");
    expect(ids(rows)).toBe("abcd");
  });
});
