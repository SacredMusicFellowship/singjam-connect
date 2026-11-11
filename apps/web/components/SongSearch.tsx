"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import SubmitSongForm from "@/components/SubmitSongForm";
import { useSongFilters } from "@/hooks/useSongFilters";
import { useSongCardActions } from "@/hooks/useSongCardActions";
import { matchedAlternateTitles, loadSongFilterMeta } from "@singjam/core";
import { useSongSearch } from "@/hooks/useSongSearch";
import { useBrowseSongs, type BrowseFilters } from "@/hooks/useBrowseSongs";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { SortDropdown } from "@/components/SortDropdown";
import { ActiveFilterChips, FilterPanel } from "@/components/FilterPanel";
import { useTagHierarchy } from "@/hooks/useTagHierarchy";
import SongCard from "@/components/SongCard";
import SearchInput from "@/components/SearchInput";
import FiltersButton from "@/components/FiltersButton";
import HideMySongsToggle from "@/components/HideMySongsToggle";

type FilterMeta = {
  song_id: string;
  genres: string[];
  languages: string[];
  themes: string[];
  cultures: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
};

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "popularity" as const, label: "Popular" },
  { value: "title_asc" as const, label: "A–Z" },
  { value: "title_desc" as const, label: "Z–A" },
];

export default function SongSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);

  const [q, setQ] = useState(() => {
    if (typeof window === "undefined") return initialQuery;
    return new URLSearchParams(window.location.search).get("q") ?? initialQuery;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hideMySongs, setHideMySongs] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("mine") === "hide";
  });

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [initialCount] = useState(() => {
    if (typeof window === "undefined") return PAGE_SIZE;
    const saved = Number(sessionStorage.getItem("vc:/search"));
    return Number.isFinite(saved) && saved > PAGE_SIZE ? Math.min(saved, 2000) : PAGE_SIZE;
  });

  const { results, loading, error: searchError } = useSongSearch(q, { limit: 50, debounceMs: 200 });

  const hierarchy = useTagHierarchy();
  const filters = useSongFilters(filterMeta, "popularity", hierarchy);
  const { matchesFilters, activeFilterCount, sortBy, setSortBy, expandedState } = filters;

  // The browse RPC gets each selected tag plus everything below it, as the list filter does.
  const browseFilters = useMemo<BrowseFilters>(() => ({
    genres: Array.from(expandedState.genres).sort(),
    languages: Array.from(expandedState.languages).sort(),
    themes: Array.from(expandedState.themes).sort(),
    cultures: Array.from(expandedState.cultures).sort(),
    forms: Array.from(expandedState.forms).sort(),
    occasions: Array.from(expandedState.occasions).sort(),
    communities: Array.from(expandedState.communities).sort(),
    vibe: expandedState.vibe,
    tonality: expandedState.tonality,
    meter: expandedState.meter,
    yearMin: expandedState.yearMin,
    yearMax: expandedState.yearMax,
    excludeMine: hideMySongs,
    sort: sortBy,
  }), [expandedState, hideMySongs, sortBy]);

  const {
    songs: browseSongs,
    total,
    loading: browseLoading,
    error: browseError,
    hasMore,
    loadMore,
    removeSong,
  } = useBrowseSongs(browseFilters, { pageSize: PAGE_SIZE, initialCount });

  // The viewer's songs and the add buttons, shared with the browse pages' cards.
  const actions = useSongCardActions({ onAdded: (songId) => { if (hideMySongs) removeSong(songId); } });
  const { currentUser, repertoire } = actions;

  useEffect(() => {
    if (browseSongs.length > 0) sessionStorage.setItem("vc:/search", String(browseSongs.length));
  }, [browseSongs.length]);

  useEffect(() => {
    // Slim per-song filter fields for the cascading filter-pill options —
    // the browse list itself is paginated via the browse_songs RPC
    loadSongFilterMeta(supabase).then((m) => setFilterMeta(m as FilterMeta[]), () => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Search results: apply active filters and hide-my-songs client-side (≤50 rows)
  const filteredResults = useMemo(() => {
    return results.filter((r) => {
      if (hideMySongs && repertoire.has(r.song_id)) return false;
      if (activeFilterCount === 0) return true;
      return matchesFilters(r);
    });
  }, [results, activeFilterCount, matchesFilters, hideMySongs, repertoire]);

  const sortedSearch = useMemo(() => {
    if (sortBy === "title_asc") return [...filteredResults].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "title_desc") return [...filteredResults].sort((a, b) => b.title.localeCompare(a.title));
    return [...filteredResults].sort((a, b) => b.popularity - a.popularity || a.title.localeCompare(b.title));
  }, [filteredResults, sortBy]);

  // Infinite scroll observer
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [loadMore]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (q) {
      params.set("q", q);
    } else {
      params.delete("q");
    }
    if (hideMySongs) params.set("mine", "hide");
    else params.delete("mine");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q, hideMySongs]);

  const searching = q.trim().length > 0;

  // Back from a song lands where the visitor was: the query and filters are in
  // the URL and the loaded row count in sessionStorage, so once that many rows
  // are back the saved scroll position has something to land on.
  const restoreReady = searching
    ? !loading && results.length > 0
    : !browseLoading && browseSongs.length > 0 && (browseSongs.length >= initialCount || !hasMore);
  const saveScrollPosition = useScrollRestoration("scroll:/search", restoreReady);

  return (
    <div
      className="space-y-3"
      onClickCapture={(e) => {
        if ((e.target as HTMLElement).closest('a[href^="/songs/"]')) saveScrollPosition();
      }}
    >
      <SearchInput
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onClear={() => setQ("")}
        placeholder="Search by title, first line, recording artist, or composer"
      />
      {(loading || q.trim()) && (
        <div className="px-1 text-xs text-zinc-500">
          {loading
            ? "Searching…"
            : `${sortedSearch.length} song${sortedSearch.length === 1 ? "" : "s"}${activeFilterCount > 0 && sortedSearch.length < results.length ? ` (${results.length} before filters)` : ""}`}
        </div>
      )}
      {(searchError ?? browseError ?? status ?? actions.status) ? <div className="px-1 text-sm text-zinc-700">{searchError ?? browseError ?? status ?? actions.status}</div> : null}

      {/* Filter bar */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 px-1">
          <div className="flex items-center gap-2">
            <SortDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} align="left" />
            <FiltersButton count={activeFilterCount} onClick={() => setFiltersOpen((o) => !o)} />
            {currentUser && repertoire.size > 0 && (
              <HideMySongsToggle checked={hideMySongs} onChange={setHideMySongs} />
            )}
          </div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            {searching || total === null ? null : `${total} song${total === 1 ? "" : "s"}`}
          </p>
        </div>

        <ActiveFilterChips filters={filters} />

        {filtersOpen && (
          <FilterPanel filters={filters} hierarchy={hierarchy} />
        )}

        {/* Song list: search results or browse list */}
        {searching ? (
          <div className="grid gap-2">
            {sortedSearch.map((r) => (
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
                aka={matchedAlternateTitles(r.aka, q, r.title)}
                genres={r.genres}
                forms={r.forms}
                occasions={r.occasions}
                communities={r.communities}
                languages={r.languages ?? []}
                popularity={r.popularity}
                youtubeId={r.youtube_id}
                spotifyTrackId={r.spotify_track_id}
                {...actions.cardProps}
              />
            ))}
            {!loading && sortedSearch.length === 0 ? (
              <div className="rounded-2xl border border-zinc-200 p-5 text-sm text-zinc-600">
                {results.length > 0 ? "No results match the active filters." : "No songs found."}
              </div>
            ) : null}
          </div>
        ) : browseLoading && browseSongs.length === 0 ? (
          <div className="divide-y rounded-md border">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center justify-between p-4">
                <div className="space-y-1.5">
                  <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
                  <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
                </div>
                <div className="flex gap-2">
                  <div className="h-7 w-16 animate-pulse rounded-xl bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={`grid gap-2 transition-opacity ${browseLoading ? "opacity-60" : ""}`}>
            {browseSongs.map((r) => (
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
                popularity={r.popularity}
                youtubeId={r.youtube_id}
                spotifyTrackId={r.spotify_track_id}
                {...actions.cardProps}
              />
            ))}

            {hasMore && (
              <div ref={sentinelRef} className="py-4 text-center text-xs text-zinc-400">
                Loading more…
              </div>
            )}
            {!hasMore && total !== null && total > PAGE_SIZE && (
              <div className="py-4 text-center text-xs text-zinc-400">
                All {total} songs shown
              </div>
            )}
            {total === 0 && (
              <div className="rounded-2xl border border-zinc-200 p-5 text-sm text-zinc-600">
                No songs match the selected filters.
              </div>
            )}
          </div>
        )}
      </div>

      {currentUser && <SubmitSongForm />}
    </div>
  );
}
