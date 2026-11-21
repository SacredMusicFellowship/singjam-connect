"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CHART_QUEUE_DEFAULT_DIR, sortChartQueue, type ChartQueueSort } from "@singjam/core";
import Select from "@/components/Select";
import { FormattedDate } from "@/components/FormattedTime";
import ChartReviewActions from "@/components/ChartReviewActions";

export type QueueComment = {
  id: string;
  kind: string;
  body: string;
  createdAt: string;
  author: string | null;
  otherChartUrl: string | null;
};

export type QueueRow = {
  id: string;
  url: string;
  createdAt: string;
  songTitle: string;
  songHref: string;
  artist: string | null;
  currentChartUrl: string | null;
  adder: string | null;
  reportedAt: string | null;
  reportedBy: string | null;
  canReview: boolean;
  thread: QueueComment[];
};

const SORTS: { key: ChartQueueSort; label: string }[] = [
  { key: "added", label: "Date added" },
  { key: "song", label: "Song" },
  { key: "adder", label: "Added by" },
  { key: "reported", label: "Reported" },
];

const KIND_LABEL: Record<string, string> = {
  report: "Reported",
  approve: "Approved",
  reject: "Rejected",
  replace: "Replaced",
};

const DATE = { month: "short", day: "numeric", year: "numeric" } as const;

export default function ChartReviewQueue({ rows }: { rows: QueueRow[] }) {
  const [sort, setSort] = useState<{ col: ChartQueueSort; dir: "asc" | "desc" }>({ col: "added", dir: "asc" });

  function toggleSort(col: ChartQueueSort) {
    setSort((prev) => (prev.col === col ? { col, dir: prev.dir === "asc" ? "desc" : "asc" } : { col, dir: CHART_QUEUE_DEFAULT_DIR[col] }));
  }

  const sorted = useMemo(() => sortChartQueue(rows, sort.col, sort.dir), [rows, sort]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 sm:w-fit">
        <label htmlFor="chart-queue-sort" className="text-xs font-medium text-slate-500">
          Sort by
        </label>
        <Select
          id="chart-queue-sort"
          value={sort.col}
          onChange={(e) => toggleSort(e.target.value as ChartQueueSort)}
          shape="pill"
          size="sm"
          wrapperClassName="flex-1 sm:w-40 sm:flex-none"
        >
          {SORTS.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </Select>
        <button
          onClick={() => setSort((prev) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }))}
          className="rounded-full border border-slate-200 px-2 py-1 text-sm text-slate-500"
          aria-label={sort.dir === "asc" ? "Sort ascending" : "Sort descending"}
        >
          {sort.dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {sorted.map((r) => {
          const isLive = r.currentChartUrl === r.url;
          return (
            <div key={r.id} className="space-y-3 px-5 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <Link href={r.songHref} className="block w-fit max-w-full truncate text-sm font-medium text-zinc-900 hover:underline">
                    {r.songTitle}
                  </Link>
                  {r.artist && <p className="truncate text-xs text-zinc-500">{r.artist}</p>}
                  <p className="flex flex-wrap gap-x-3 text-xs">
                    <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-amber-600 hover:underline">
                      Open chart ↗
                    </a>
                    {!isLive && r.currentChartUrl && (
                      <a href={r.currentChartUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:underline">
                        Current chart ↗
                      </a>
                    )}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {r.adder ? `Added by ${r.adder}` : "Existing chart"} · <FormattedDate iso={r.createdAt} options={DATE} />
                    {isLive ? " · showing on the song now" : " · waiting to replace the current chart"}
                  </p>
                  {r.reportedAt && (
                    <p className="text-xs font-medium text-red-600">
                      Reported{r.reportedBy ? ` by ${r.reportedBy}` : ""} · <FormattedDate iso={r.reportedAt} options={DATE} />
                    </p>
                  )}
                </div>
                <ChartReviewActions submissionId={r.id} canReview={r.canReview} />
              </div>
              {r.thread.length > 0 && (
                <ul className="space-y-2 rounded-xl bg-zinc-50 px-3 py-2.5">
                  {r.thread.map((c) => {
                    const label = KIND_LABEL[c.kind];
                    return (
                      <li key={c.id} className="text-xs">
                        <p className="text-zinc-400">
                          {[c.author, label].filter(Boolean).join(" · ")}
                          {(c.author || label) && " · "}
                          <FormattedDate iso={c.createdAt} options={DATE} />
                          {c.otherChartUrl && (
                            <>
                              {" · "}
                              <a href={c.otherChartUrl} target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:underline">
                                another chart ↗
                              </a>
                            </>
                          )}
                        </p>
                        <p className="whitespace-pre-wrap text-zinc-700">{c.body}</p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
