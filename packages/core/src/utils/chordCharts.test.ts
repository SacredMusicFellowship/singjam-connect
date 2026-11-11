import { describe, it, expect } from "vitest";
import { canReviewChart, isUltimateGuitarChartUrl, newChartGoesLive } from "./chordCharts";

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
  it("lets song editors and admins review other people's charts", () => {
    expect(canReviewChart({ id: "a", role: "song_editor" }, "b")).toBe(true);
    expect(canReviewChart({ id: "a", role: "admin" }, null)).toBe(true);
  });
  it("never their own, and never members", () => {
    expect(canReviewChart({ id: "a", role: "admin" }, "a")).toBe(false);
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
