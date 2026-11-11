"use client";

import { useMemo, useState } from "react";
import type { BrowseSongRow } from "@/lib/browse";
import { useSongFilters } from "@/hooks/useSongFilters";
import { useTagHierarchy } from "@/hooks/useTagHierarchy";
import { ActiveFilterChips, FilterPanel } from "@/components/FilterPanel";
import { SortDropdown } from "@/components/SortDropdown";
import SongCard from "@/components/SongCard";
import { useSongCardActions } from "@/hooks/useSongCardActions";
import FiltersButton from "@/components/FiltersButton";

const SORT_OPTIONS = [
  { value: "popularity" as const, label: "Most known" },
  { value: "title_asc" as const, label: "A–Z" },
  { value: "title_desc" as const, label: "Z–A" },
];

// A browse page's songs with the Song Library's filters, scoped to this page
// (each row carries its own filter fields).
export default function BrowseSongList({ songs, roles }: {
  songs: BrowseSongRow[];
  roles: Record<string, string>;
}) {
  const hierarchy = useTagHierarchy();
  const filters = useSongFilters(songs, "popularity", hierarchy);
  const { matchesFilters, activeFilterCount, sortBy, setSortBy } = filters;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const actions = useSongCardActions();
  const { currentUser, repertoire } = actions;
  // The songs you knew when you ticked the box: ones you add after stay in view.
  const [hidden, setHidden] = useState<Set<string> | null>(null);

  const shown = useMemo(() => {
    const list = activeFilterCount === 0 && !hidden ? songs : songs.filter((s) => !hidden?.has(s.song_id) && matchesFilters(s));
    if (sortBy === "title_asc") return [...list].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "title_desc") return [...list].sort((a, b) => b.title.localeCompare(a.title));
    return list;
  }, [songs, activeFilterCount, matchesFilters, sortBy, hidden]);

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 px-1">
        <SortDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} align="left" />
        {songs.length > 1 && (
          <FiltersButton count={activeFilterCount} onClick={() => setFiltersOpen((o) => !o)} />
        )}
        {currentUser && repertoire.size > 0 && (
          <label className="h-7 flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-500 cursor-pointer select-none hover:bg-zinc-50 transition-colors whitespace-nowrap">
            <input
              type="checkbox"
              checked={hidden !== null}
              onChange={(e) => setHidden(e.target.checked ? new Set(repertoire.keys()) : null)}
              className="rounded border-zinc-300 accent-amber-500"
            />
            Hide my songs
          </label>
        )}
        {(activeFilterCount > 0 || hidden) && <span className="text-xs text-zinc-500">{shown.length} of {songs.length}</span>}
      </div>
      <ActiveFilterChips filters={filters} />
      {filtersOpen && <FilterPanel filters={filters} hierarchy={hierarchy} />}

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white px-5 py-8 text-center text-sm text-zinc-500">{hidden && activeFilterCount === 0 ? "You know every song here." : "No songs here match these filters."}</div>
      ) : (
        <div className="grid gap-2">
          {shown.map((r) => (
            <SongCard
              key={r.song_id}
              songId={r.song_id}
              title={r.title}
              slug={r.slug}
              displayArtist={r.display_artist}
              byline={r.byline}
              cardIdentity={r.card_identity}
              composers={r.composers}
              cultures={r.cultures ?? []}
              productions={r.productions}
              recordingArtists={r.recording_artists}
              productionCredits={r.production_credits}
              aka={null}
              genres={r.genres}
              forms={r.forms}
              occasions={r.occasions}
              communities={r.communities}
              languages={r.languages ?? []}
              context={roles[r.song_id] ?? null}
              popularity={r.popularity}
              youtubeId={r.youtube_id}
              spotifyTrackId={r.spotify_track_id}
              {...actions.cardProps}
            />
          ))}
        </div>
      )}
    </section>
  );
}
