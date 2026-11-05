"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import SubmitSongForm from "@/components/SubmitSongForm";
import { useSongFilters } from "@/hooks/useSongFilters";
import { useSongSearch } from "@/hooks/useSongSearch";
import { useBrowseSongs, type BrowseFilters } from "@/hooks/useBrowseSongs";
import { SortDropdown } from "@/components/SortDropdown";
import { FilterPanel } from "@/components/FilterPanel";
import SongCard from "@/components/SongCard";
import SearchInput from "@/components/SearchInput";

type FilterMeta = {
  song_id: string;
  genres: string[];
  languages: string[];
  themes: string[];
  cultures: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
};

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "popularity" as const, label: "Popular" },
  { value: "title_asc" as const, label: "A → Z" },
  { value: "title_desc" as const, label: "Z → A" },
];

export default function SongSearch({ initialQuery = "" }: { initialQuery?: string }) {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [filterMeta, setFilterMeta] = useState<FilterMeta[]>([]);
  const [singingVoice, setSingingVoice] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [q, setQ] = useState(() => {
    if (typeof window === "undefined") return initialQuery;
    return new URLSearchParams(window.location.search).get("q") ?? initialQuery;
  });
  const [status, setStatus] = useState<string | null>(null);
  const [pendingAddId, setPendingAddId] = useState<string | null>(null);
  const [repertoire, setRepertoire] = useState<Map<string, string>>(new Map());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hideMySongs, setHideMySongs] = useState(false);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [initialCount] = useState(() => {
    if (typeof window === "undefined") return PAGE_SIZE;
    const saved = Number(sessionStorage.getItem("vc:/search"));
    // browse_songs caps p_limit at 200 server-side
    return Number.isFinite(saved) && saved > PAGE_SIZE ? Math.min(saved, 200) : PAGE_SIZE;
  });

  const { results, loading, error: searchError } = useSongSearch(q, { limit: 50, debounceMs: 200 });

  const {
    filterOptions, matchesFilters,
    selectedGenres, selectedLanguages, selectedThemes, selectedCultures,
    selectedVibe, setSelectedVibe,
    selectedTonality, setSelectedTonality,
    selectedMeter, setSelectedMeter,
    yearMin, setYearMin,
    yearMax, setYearMax,
    yearBounds,
    activeFilterCount,
    toggleGenre, toggleLanguage, toggleTheme, toggleCulture, clearFilters,
    sortBy, setSortBy,
  } = useSongFilters(filterMeta, "popularity");

  const browseFilters = useMemo<BrowseFilters>(() => ({
    genres: Array.from(selectedGenres).sort(),
    languages: Array.from(selectedLanguages).sort(),
    themes: Array.from(selectedThemes).sort(),
    cultures: Array.from(selectedCultures).sort(),
    vibe: selectedVibe,
    tonality: selectedTonality,
    meter: selectedMeter,
    yearMin,
    yearMax,
    excludeMine: hideMySongs,
    sort: sortBy,
  }), [selectedGenres, selectedLanguages, selectedThemes, selectedCultures, selectedVibe, selectedTonality, selectedMeter, yearMin, yearMax, hideMySongs, sortBy]);

  const {
    songs: browseSongs,
    total,
    loading: browseLoading,
    error: browseError,
    hasMore,
    loadMore,
    removeSong,
  } = useBrowseSongs(browseFilters, { pageSize: PAGE_SIZE, initialCount });

  useEffect(() => {
    if (browseSongs.length > 0) sessionStorage.setItem("vc:/search", String(browseSongs.length));
  }, [browseSongs.length]);

  useEffect(() => {
    // User data — session reads from localStorage (fast), then fetches profile + repertoire
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setCurrentUser(session.user);
      Promise.all([
        supabase.from("profiles").select("singing_voice").eq("id", session.user.id).single(),
        supabase.from("user_songs").select("song_id, confidence").eq("user_id", session.user.id),
      ]).then(([profileRes, repertoireRes]) => {
        setSingingVoice((profileRes.data as any)?.singing_voice ?? null);
        setRepertoire(new Map(((repertoireRes.data ?? []) as any[]).map((r) => [r.song_id, r.confidence ?? ""])));
      });
    });

    // Slim per-song filter fields for the cascading filter-pill options —
    // the browse list itself is paginated via the browse_songs RPC
    supabase.rpc("song_filter_meta").then(({ data }) => {
      setFilterMeta((data ?? []) as FilterMeta[]);
    });
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
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [q]);

  async function handlePendingAdd(songId: string, slug?: string | null) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      const next = slug ? `/songs/${slug}` : "/search";
      router.push(`/auth?next=${encodeURIComponent(next)}`);
      return;
    }
    setPendingAddId(songId);
  }

  async function addSong(songId: string, level: string) {
    setPendingAddId(null);
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) { router.push(`/auth?next=${encodeURIComponent(window.location.pathname)}`); return; }
    const { error } = await supabase.from("user_songs").upsert(
      { user_id: session.user.id, song_id: songId, confidence: level, updated_at: new Date().toISOString() },
      { onConflict: "user_id,song_id" }
    );
    if (error) {
      setStatus(error.message);
    } else {
      setRepertoire((prev) => new Map(prev).set(songId, level));
      if (hideMySongs) removeSong(songId);
    }
  }

  const searching = q.trim().length > 0;

  return (
    <div className="space-y-3">
      {/* Search box */}
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm space-y-3">
        <div>
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ("")}
            placeholder="Search by title, first line, recording artist, or composer"
          />
        </div>
        <div className="text-xs text-zinc-500">
          {loading
            ? "Searching…"
            : q.trim()
              ? `${sortedSearch.length} song(s)${activeFilterCount > 0 && sortedSearch.length < results.length ? ` (${results.length} before filters)` : ""}`
              : null}
        </div>
        {(searchError ?? browseError ?? status) ? <div className="text-sm text-zinc-700">{searchError ?? browseError ?? status}</div> : null}
      </div>

      {/* Filter bar */}
      <div className="space-y-2">
        <div className="flex flex-col gap-2 px-1">
          <div className="flex items-center gap-2">
            <SortDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} align="left" />
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`h-7 flex items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
                activeFilterCount > 0
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                <path d="M1.5 3h13a.5.5 0 0 1 0 1H1.5a.5.5 0 0 1 0-1zm2 4h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1zm3 4h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1z" />
              </svg>
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
            {currentUser && repertoire.size > 0 && (
              <label className="h-7 flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-500 cursor-pointer select-none hover:bg-zinc-50 transition-colors whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={hideMySongs}
                  onChange={(e) => setHideMySongs(e.target.checked)}
                  className="rounded border-zinc-300 accent-amber-500"
                />
                Hide my songs
              </label>
            )}
          </div>
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            {searching || total === null ? null : `${total} song${total === 1 ? "" : "s"}`}
          </p>
        </div>

        {filtersOpen && (
          <FilterPanel
            filterOptions={filterOptions}
            selectedGenres={selectedGenres}
            selectedLanguages={selectedLanguages}
            selectedThemes={selectedThemes}
            selectedCultures={selectedCultures}
            selectedVibe={selectedVibe}
            setSelectedVibe={setSelectedVibe}
            selectedTonality={selectedTonality}
            setSelectedTonality={setSelectedTonality}
            selectedMeter={selectedMeter}
            setSelectedMeter={setSelectedMeter}
            yearMin={yearMin}
            setYearMin={setYearMin}
            yearMax={yearMax}
            setYearMax={setYearMax}
            yearBounds={yearBounds}
            activeFilterCount={activeFilterCount}
            toggleGenre={toggleGenre}
            toggleLanguage={toggleLanguage}
            toggleTheme={toggleTheme}
            toggleCulture={toggleCulture}
            clearFilters={clearFilters}
          />
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
                composers={r.composers}
                cultures={r.cultures ?? []}
                productions={r.productions}
                year={r.year}
                aka={r.aka}
                genres={r.genres}
                languages={r.languages ?? []}
                popularity={r.popularity}
                youtubeId={r.youtube_id}
                spotifyTrackId={r.spotify_track_id}
                repertoire={repertoire}
                pendingAddId={pendingAddId}
                singingVoice={singingVoice}
                setPendingAddId={setPendingAddId}
                onAdd={handlePendingAdd}
                addSong={addSong}
                onVoiceUpdated={(v) => setSingingVoice(v)}
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
                composers={r.composers}
                cultures={r.cultures}
                productions={r.productions}
                year={r.year}
                aka={null}
                genres={r.genres}
                languages={r.languages ?? []}
                popularity={r.popularity}
                youtubeId={r.youtube_id}
                spotifyTrackId={r.spotify_track_id}
                repertoire={repertoire}
                pendingAddId={pendingAddId}
                singingVoice={singingVoice}
                setPendingAddId={setPendingAddId}
                onAdd={handlePendingAdd}
                addSong={addSong}
                onVoiceUpdated={(v) => setSingingVoice(v)}
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
