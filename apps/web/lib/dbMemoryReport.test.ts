import { describe, expect, it } from "vitest";
import {
  buildDbMemoryReport,
  parseDbMemoryMetrics,
  renderDbMemoryEmail,
  swapInGbPerDay,
  type DbMemorySample,
} from "./dbMemoryReport";

const labels = '{supabase_project_ref="testref",service_type="db"}';
const METRICS_TEXT = [
  "# HELP node_memory_MemTotal_bytes Memory information field MemTotal_bytes.",
  `node_memory_MemTotal_bytes${labels} 4.31304704e+08`,
  `node_memory_MemAvailable_bytes${labels} 1.23527168e+08`,
  `node_memory_SwapTotal_bytes${labels} 1.073737728e+09`,
  `node_memory_SwapFree_bytes${labels} 6.12917248e+08`,
  `node_vmstat_pswpin${labels} 8.26532131e+08`,
  `node_vmstat_pswpout${labels} 9.21003449e+08`,
  `node_vmstat_pswpin_other${labels} 1`,
].join("\n");

const NOW = new Date("2026-11-30T17:00:00Z");
const HOUR = 3_600_000;

// Readings every 6 hours going back `days`, oldest first.
function series(days: number, at: (hoursAgo: number) => Partial<DbMemorySample>): DbMemorySample[] {
  const out: DbMemorySample[] = [];
  for (let h = days * 24; h >= 0; h -= 6) {
    out.push({
      taken_at: new Date(NOW.getTime() - h * HOUR).toISOString(),
      mem_total_mb: 411,
      mem_available_mb: 120,
      swap_used_mb: 450,
      swap_in_pages: 1_000_000 + (days * 24 - h) * 10_000,
      swap_out_pages: 0,
      ...at(h),
    });
  }
  return out;
}

describe("parseDbMemoryMetrics", () => {
  it("reads memory and swap figures from the metrics text", () => {
    expect(parseDbMemoryMetrics(METRICS_TEXT)).toEqual({
      mem_total_mb: 411,
      mem_available_mb: 118,
      swap_used_mb: 439,
      swap_in_pages: 826532131,
      swap_out_pages: 921003449,
    });
  });

  it("returns null when a figure is missing", () => {
    expect(parseDbMemoryMetrics(METRICS_TEXT.replace(/node_vmstat_pswpin\{.*\n/, ""))).toBeNull();
  });
});

describe("swapInGbPerDay", () => {
  it("skips the gap where the counter reset after a restart", () => {
    const samples = [
      { taken_at: "2026-11-20T00:00:00Z", swap_in_pages: 1_000_000 },
      { taken_at: "2026-11-21T00:00:00Z", swap_in_pages: 1_244_141 },
      { taken_at: "2026-11-22T00:00:00Z", swap_in_pages: 5 },
    ] as DbMemorySample[];
    expect(swapInGbPerDay(samples)).toBeCloseTo(1, 2);
  });
});

describe("buildDbMemoryReport", () => {
  it("gives no verdict with less than 2 days of readings", () => {
    expect(buildDbMemoryReport(series(1, () => ({})), NOW).verdict).toBe("no_verdict");
  });

  it("says OK when swap is steady and reads are light", () => {
    const report = buildDbMemoryReport(series(7, () => ({})), NOW);
    expect(report.verdict).toBe("ok");
    expect(report.facts.find(([k]) => k === "Swap used now")?.[1]).toBe("450 MB (+0 MB on the week)");
  });

  it("suggests a resize when swap grows through the week", () => {
    const report = buildDbMemoryReport(series(7, (h) => ({ swap_used_mb: 450 + (168 - h) / 2 })), NOW);
    expect(report.verdict).toBe("consider_resize");
    expect(report.reasons[0]).toMatch(/^Swap grew by \d+ MB/);
  });

  it("suggests a resize when free RAM nearly runs out", () => {
    const report = buildDbMemoryReport(series(7, (h) => ({ mem_available_mb: h === 24 ? 30 : 120 })), NOW);
    expect(report.verdict).toBe("consider_resize");
    expect(report.reasons).toContain("Free RAM dropped to 30 MB at one point, close to running out.");
  });

  it("suggests a resize when swap reads are heavy", () => {
    const heavy = series(7, (h) => ({ swap_in_pages: (168 - h) * 1_000_000 }));
    expect(buildDbMemoryReport(heavy, NOW).reasons.some((r) => r.startsWith("Swap reading averaged"))).toBe(true);
  });

  it("compares with the previous week when there is one", () => {
    const twoWeeks = series(14, (h) => ({ swap_in_pages: h > 168 ? (336 - h) * 10_000 : 1_680_000 + (168 - h) * 40_000 }));
    expect(buildDbMemoryReport(twoWeeks, NOW).reasons.some((r) => r.startsWith("Swap reading rose from"))).toBe(true);
  });
});

describe("renderDbMemoryEmail", () => {
  it("puts the verdict in the subject", () => {
    const { subject, html } = renderDbMemoryEmail(buildDbMemoryReport(series(7, () => ({})), NOW));
    expect(subject).toBe("Supabase weekly: OK as is");
    expect(html).toContain("No action needed this week.");
  });
});
