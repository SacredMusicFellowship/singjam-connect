"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { BrowseKind } from "@singjam/core";
import type { BrowseFilterMeta, BrowseSongRow } from "@/lib/browse";
import { useSongFilters } from "@/hooks/useSongFilters";
import { useTagHierarchy } from "@/hooks/useTagHierarchy";
import { ActiveFilterChips, FilterPanel } from "@/components/FilterPanel";
import { SortDropdown } from "@/components/SortDropdown";

const SORT_OPTIONS = [
  { value: "popularity" as const, label: "Most known" },
  { value: "title_asc" as const, label: "A–Z" },
  { value: "title_desc" as const, label: "Z–A" },
];

// A browse page's songs with the Song Library's filters, scoped to this page.
export default function BrowseSongList({ kind, songs, meta, roles }: {
  kind: BrowseKind;
  songs: BrowseSongRow[];
  meta: BrowseFilterMeta[];
  roles: Record<string, string>;
}) {
  const hierarchy = useTagHierarchy();
  const filters = useSongFilters(meta, "popularity", hierarchy);
  const { matchesFilters, activeFilterCount, sortBy, setSortBy } = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const metaById = useMemo(() => new Map(meta.map((m) => [m.song_id, m])), [meta]);

  const shown = useMemo(() => {
    const list = songs.filter((s) => activeFilterCount === 0 || matchesFilters(metaById.get(s.song_id)));
    if (sortBy === "title_asc") return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "title_desc") return [...list].sort((a, b) => b.title.localeCompare(a.title));
    return list;
  }, [songs, activeFilterCount, matchesFilters, metaById, sortBy]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <SortDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} align="left" />
        {songs.length > 1 && (
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className={`h-7 flex items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
              activeFilterCount > 0 ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
            }`}
          >
            Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
          </button>
        )}
        {activeFilterCount > 0 && <span className="text-xs text-zinc-500">{shown.length} of {songs.length}</span>}
      </div>
      <ActiveFilterChips filters={filters} />
      {filtersOpen && <FilterPanel filters={filters} hierarchy={hierarchy} />}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-500">No songs here match these filters.</div>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {shown.map((s) => {
            const show = s.production_credits?.[0];
            const line = [roles[s.song_id], s.byline ?? s.display_artist].filter(Boolean).join(" · ");
            return (
              <li key={s.song_id}>
                <Link href={`/songs/${s.slug ?? s.song_id}`} className="flex items-baseline justify-between gap-3 px-4 py-3 hover:bg-amber-50/40">
                  <span className="min-w-0">
                    <span className="block font-medium text-zinc-900">{s.title}</span>
                    <span className="block truncate text-sm text-zinc-500">
                      {kind !== "show" && show ? <>from <em>{show.name}</em>{show.year ? ` (${show.year})` : ""}{line ? " · " : ""}</> : null}
                      {line}
                    </span>
                  </span>
                  {s.popularity > 0 && (
                    <span className="shrink-0 text-xs tabular-nums text-zinc-400">{s.popularity} know{s.popularity === 1 ? "s" : ""} it</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
