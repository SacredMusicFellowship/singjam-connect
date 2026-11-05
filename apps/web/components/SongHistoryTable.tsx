"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { SongPlayStat } from "@/lib/songPlayStats";

import Select from "@/components/Select";
type SortCol = "title" | "artist" | "playCount" | "lastPlayedAt";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortCol; label: string }[] = [
  { key: "title", label: "Title" },
  { key: "artist", label: "Artist" },
  { key: "playCount", label: "Times played" },
  { key: "lastPlayedAt", label: "Last played" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SongHistoryTable({ stats }: { stats: SongPlayStat[] }) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "playCount", dir: "desc" });

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "title" || col === "artist" ? "asc" : "desc" }
    );
  }

  const sorted = useMemo(() => {
    const { col, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    return [...stats].sort((a, b) => {
      let cmp = 0;
      if (col === "title") cmp = a.title.localeCompare(b.title);
      else if (col === "artist") cmp = (a.displayArtist ?? "").localeCompare(b.displayArtist ?? "");
      else if (col === "playCount") cmp = a.playCount - b.playCount;
      else if (col === "lastPlayedAt") cmp = a.lastPlayedAt.localeCompare(b.lastPlayedAt);
      return cmp * mul || a.title.localeCompare(b.title);
    });
  }, [stats, sort]);

  if (!sorted.length) {
    return (
      <p className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center text-slate-400">
        No songs have been played at official events yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {/* Mobile sort controls */}
      <div className="sm:hidden flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <label htmlFor="song-history-sort" className="text-xs font-medium text-slate-500">
          Sort by
        </label>
        <Select
          id="song-history-sort"
          value={sort.col}
          onChange={(e) => toggleSort(e.target.value as SortCol)}
          shape="pill"
          size="sm"
          wrapperClassName="flex-1"
        >
          {COLUMNS.map((col) => (
            <option key={col.key} value={col.key}>
              {col.label}
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

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {sorted.map((s) => (
          <div key={s.songId} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/songs/${s.slug ?? s.songId}`}
                  className="block truncate font-medium text-slate-900 hover:text-amber-600 hover:underline"
                >
                  {s.title}
                </Link>
                {s.displayArtist && (
                  <div className="mt-0.5 truncate text-xs text-slate-500">{s.displayArtist}</div>
                )}
                <div className="mt-1 text-xs text-slate-400">
                  Last played {formatDate(s.lastPlayedAt)}
                  {s.lastJamName ? ` — ${s.lastJamName}` : ""}
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                {s.playCount}×
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3 select-none">
                  <button onClick={() => toggleSort(col.key)} className="flex items-center gap-1 hover:text-slate-800">
                    {col.label}
                    <span className="text-slate-300">
                      {sort.col === col.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((s) => (
              <tr key={s.songId} className="hover:bg-slate-50">
                <td className="px-4 py-2.5 font-medium">
                  <Link
                    href={`/songs/${s.slug ?? s.songId}`}
                    className="text-slate-900 hover:text-amber-600 hover:underline"
                  >
                    {s.title}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-slate-500">{s.displayArtist ?? "—"}</td>
                <td className="px-4 py-2.5 text-slate-500">{s.playCount}</td>
                <td className="px-4 py-2.5 text-slate-500">
                  {formatDate(s.lastPlayedAt)}
                  {s.lastJamName ? ` — ${s.lastJamName}` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
