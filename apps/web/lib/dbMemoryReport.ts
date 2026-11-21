export type DbMemorySample = {
  taken_at: string;
  mem_total_mb: number;
  mem_available_mb: number;
  swap_used_mb: number;
  swap_in_pages: number;
  swap_out_pages: number;
};

export type DbMemoryVerdict = "ok" | "consider_pro" | "no_verdict";

export type DbMemoryReport = {
  verdict: DbMemoryVerdict;
  reasons: string[];
  facts: [string, string][];
};

const PAGE_GB = 4096 / 1e9;
const DAY_MS = 86_400_000;

export const THRESHOLDS = {
  swapGrowthMb: 50,
  minAvailableMb: 40,
  swapInGbPerDay: 20,
  swapInGrowth: 1.5,
  minSpanDays: 2,
};

const METRICS = {
  node_memory_MemTotal_bytes: "memTotal",
  node_memory_MemAvailable_bytes: "memAvailable",
  node_memory_SwapTotal_bytes: "swapTotal",
  node_memory_SwapFree_bytes: "swapFree",
  node_vmstat_pswpin: "swapIn",
  node_vmstat_pswpout: "swapOut",
} as const;

// Reads the Prometheus text from Supabase's /customer/v1/privileged/metrics.
export function parseDbMemoryMetrics(text: string): Omit<DbMemorySample, "taken_at"> | null {
  const values: Partial<Record<(typeof METRICS)[keyof typeof METRICS], number>> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^(\w+)(?:\{[^}]*\})?\s+(\S+)$/);
    if (!match) continue;
    const key = METRICS[match[1] as keyof typeof METRICS];
    if (key && values[key] === undefined) values[key] = Number(match[2]);
  }
  const { memTotal, memAvailable, swapTotal, swapFree, swapIn, swapOut } = values;
  if ([memTotal, memAvailable, swapTotal, swapFree, swapIn, swapOut].some((v) => v === undefined || Number.isNaN(v))) {
    return null;
  }
  const mb = (bytes: number) => Math.round(bytes / 1_048_576);
  return {
    mem_total_mb: mb(memTotal!),
    mem_available_mb: mb(memAvailable!),
    swap_used_mb: mb(swapTotal! - swapFree!),
    swap_in_pages: Math.round(swapIn!),
    swap_out_pages: Math.round(swapOut!),
  };
}

// Swap read back from disk per day. A counter that goes down means the server
// restarted, so that gap is skipped.
export function swapInGbPerDay(samples: DbMemorySample[]): number | null {
  let gb = 0;
  let ms = 0;
  for (let i = 1; i < samples.length; i++) {
    const pages = samples[i].swap_in_pages - samples[i - 1].swap_in_pages;
    if (pages < 0) continue;
    gb += pages * PAGE_GB;
    ms += Date.parse(samples[i].taken_at) - Date.parse(samples[i - 1].taken_at);
  }
  return ms > 0 ? gb / (ms / DAY_MS) : null;
}

const averageSwap = (samples: DbMemorySample[]) =>
  samples.reduce((sum, s) => sum + s.swap_used_mb, 0) / samples.length;

// samples: the last 14 days, oldest first.
export function buildDbMemoryReport(samples: DbMemorySample[], now: Date): DbMemoryReport {
  const weekStart = now.getTime() - 7 * DAY_MS;
  const week = samples.filter((s) => Date.parse(s.taken_at) >= weekStart);
  const prev = samples.filter((s) => Date.parse(s.taken_at) < weekStart);

  const spanDays =
    week.length >= 2 ? (Date.parse(week[week.length - 1].taken_at) - Date.parse(week[0].taken_at)) / DAY_MS : 0;
  if (spanDays < THRESHOLDS.minSpanDays) {
    return {
      verdict: "no_verdict",
      reasons: ["Less than 2 days of readings this week, so there isn't enough to judge. Check the db-memory-sample function in Netlify."],
      facts: [],
    };
  }

  const lastAt = Date.parse(week[week.length - 1].taken_at);
  const lastDay = week.filter((s) => Date.parse(s.taken_at) >= lastAt - DAY_MS);
  const firstDay = prev.length
    ? prev.filter((s) => Date.parse(s.taken_at) >= Date.parse(prev[prev.length - 1].taken_at) - DAY_MS)
    : week.filter((s) => Date.parse(s.taken_at) <= Date.parse(week[0].taken_at) + DAY_MS);
  const growth = averageSwap(lastDay) - averageSwap(firstDay);
  const minAvailable = Math.min(...week.map((s) => s.mem_available_mb));
  const rate = swapInGbPerDay(week);
  const prevRate = prev.length >= 2 ? swapInGbPerDay(prev) : null;

  const reasons: string[] = [];
  if (growth >= THRESHOLDS.swapGrowthMb) {
    reasons.push(`Swap grew by ${Math.round(growth)} MB this week, so the server is getting more squeezed.`);
  }
  if (minAvailable < THRESHOLDS.minAvailableMb) {
    reasons.push(`Free RAM dropped to ${minAvailable} MB at one point, close to running out.`);
  }
  if (rate !== null && rate > THRESHOLDS.swapInGbPerDay) {
    reasons.push(`Swap reading averaged ${Math.round(rate)} GB/day, above the ${THRESHOLDS.swapInGbPerDay} GB/day comfort line.`);
  }
  if (rate !== null && prevRate && rate > prevRate * THRESHOLDS.swapInGrowth) {
    reasons.push(`Swap reading rose from ${Math.round(prevRate)} to ${Math.round(rate)} GB/day compared with last week.`);
  }

  const last = week[week.length - 1];
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;
  const facts: [string, string][] = [
    ["Readings this week", String(week.length)],
    ["Swap used now", `${last.swap_used_mb} MB (${signed(growth)} MB on the week)`],
    ["Lowest free RAM", `${minAvailable} MB of ${last.mem_total_mb} MB`],
    [
      "Swap reading",
      rate === null ? "—" : `${rate.toFixed(1)} GB/day${prevRate ? ` (last week ${prevRate.toFixed(1)})` : ""}`,
    ],
  ];

  if (reasons.length) return { verdict: "consider_pro", reasons, facts };
  return {
    verdict: "ok",
    reasons: ["Swap is steady and there's still some free RAM. No action needed this week."],
    facts,
  };
}

const VERDICT_TEXT: Record<DbMemoryVerdict, { label: string; color: string }> = {
  ok: { label: "OK on Free", color: "#15803d" },
  consider_pro: { label: "Consider upgrading to Pro", color: "#b91c1c" },
  no_verdict: { label: "No verdict", color: "#71717a" },
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function renderDbMemoryEmail(report: DbMemoryReport): { subject: string; html: string } {
  const { label, color } = VERDICT_TEXT[report.verdict];
  const reasons = report.reasons.map((r) => `<li>${escapeHtml(r)}</li>`).join("");
  const facts = report.facts
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#71717a">${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`)
    .join("");
  const html = `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#18181b;max-width:600px">
<p style="font-size:20px;font-weight:600;color:${color};margin:0 0 12px">${label}</p>
<ul>${reasons}</ul>
<table style="font-size:14px;margin:12px 0">${facts}</table>
<p style="color:#71717a;font-size:13px">Pro is $25/month. Its compute credit covers Micro (1 GB RAM), which should end the swapping. The resize means about 2 minutes of downtime. Also upgrade before a big ticketed event, or if another Supabase Disk IO email arrives.<br>
Sent every Monday by the db-memory-report Netlify function. Remove INFRA_REPORT_TO in Netlify to stop it.</p></div>`;
  return { subject: `Supabase weekly: ${label}`, html };
}
