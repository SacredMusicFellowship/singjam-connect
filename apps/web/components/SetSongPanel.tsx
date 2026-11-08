"use client";

import { useEffect, useMemo, useState } from "react";
import { FILTER_DIM_TAG_TYPE, fetchAllRows, songCardPills, type FilterableSong, type MultiFilterDim } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useSongSearch } from "@/hooks/useSongSearch";
import ConfidencePicker from "@/components/ConfidencePicker";
import { type SharedSong, type SortMode, displayedSongs } from "@/lib/setDisplayedSongs";
import SearchInput from "@/components/SearchInput";
import SongSubtitle from "@/components/SongSubtitle";
import { ActiveFilterChips, FilterPanel } from "@/components/FilterPanel";
import { useSongFilters } from "@/hooks/useSongFilters";
import { useTagHierarchy } from "@/hooks/useTagHierarchy";
import { useBrowseSongs, type BrowseFilters } from "@/hooks/useBrowseSongs";

type SongMeta = FilterableSong & { song_id: string };
const DIM_FOR_TYPE = Object.fromEntries(Object.entries(FILTER_DIM_TAG_TYPE).map(([dim, type]) => [type, dim])) as Record<string, MultiFilterDim>;

// The same "what it is" pills as the song cards, smaller.
function RowPills({ meta }: { meta: SongMeta | undefined }) {
  if (!meta) return null;
  const pills = songCardPills(meta);
  if (pills.length === 0) return null;
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {pills.map((p) => (
        <span key={`${p.type}:${p.name}`} className="rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-px text-[11px] text-zinc-500">{p.name}</span>
      ))}
    </span>
  );
}

function WhoKnows({ s }: { s: SharedSong }) {
  const leadsSet = new Set(s.who_else_leads);
  const parts = [
    ...(s.viewer_has
      ? [s.viewer_leads ? <strong key="you">You</strong> : <span key="you">You</span>]
      : []),
    ...s.who_else.map((name) =>
      leadsSet.has(name)
        ? <strong key={name}>{name}</strong>
        : <span key={name}>{name}</span>
    ),
  ];
  if (parts.length === 0) return null;
  const nodes = parts.flatMap((n, i) => i < parts.length - 1 ? [n, ", "] : [n]);
  return <p className="text-xs text-zinc-500 mt-0.5">({nodes})</p>;
}

function AddButton({
  inSet,
  isAdding,
  onClick,
}: {
  inSet: boolean;
  isAdding: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={inSet || isAdding}
      title={inSet ? "Already in set" : "Add to set list"}
      className={`mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${
        inSet
          ? "border-green-300 text-green-500"
          : "border-zinc-200 text-zinc-400 hover:border-zinc-400 hover:text-zinc-700"
      } disabled:cursor-default`}
    >
      {inSet ? (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
      )}
    </button>
  );
}

export default function SetSongPanel({
  setId,
  canEdit,
  isSolo,
  currentSongIds,
  userRepertoire,
  userSingingVoice,
  onSongAdding,
  onSongAdded,
  onSongAddFailed,
  onRepertoireUpdated,
  onVoiceUpdated,
}: {
  setId: string;
  canEdit: boolean;
  isSolo: boolean;
  currentSongIds: string[];
  userRepertoire: Map<string, string>;
  userSingingVoice: string | null;
  onSongAdding: (optimistic: any) => void;
  onSongAdded: (optimisticId: string, song: any, knowledge: any[]) => void;
  onSongAddFailed: (optimisticId: string) => void;
  onRepertoireUpdated: (songId: string, confidence: string) => void;
  onVoiceUpdated: (voice: string) => void;
}) {
  const [sharedSongs, setSharedSongs] = useState<SharedSong[] | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("popular");
  const [selectedLeaders, setSelectedLeaders] = useState<Set<string>>(new Set());
  const [addingId, setAddingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingSong, setPendingSong] = useState<any | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [showMissingSong, setShowMissingSong] = useState(false);
  const [missingSongTitle, setMissingSongTitle] = useState("");
  const [missingSongArtist, setMissingSongArtist] = useState("");
  const [missingSongBusy, setMissingSongBusy] = useState(false);
  const [missingSongError, setMissingSongError] = useState<string | null>(null);

  const { results: searchResults, loading: searching } = useSongSearch(searchQuery, { limit: 20 });
  const supabase = supabaseBrowser();
  const [productionsBySong, setProductionsBySong] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    fetchAllRows<{ song_id: string; productions: { name: string } | null }>((from, to) =>
      supabase
        .from("song_productions")
        .select("song_id, productions(name)")
        .order("song_id")
        .order("production_id")
        .range(from, to) as any
    )
      .then((rows) => {
        const map = new Map<string, string[]>();
        for (const r of rows) {
          if (r.productions?.name) map.set(r.song_id, [...(map.get(r.song_id) ?? []), r.productions.name]);
        }
        setProductionsBySong(map);
      })
      .catch(() => {});
  }, []);

  function fetchSharedSongs() {
    const rpc = isSolo ? "solo_set_songs" : "set_shared_songs";
    supabase.rpc(rpc, { set_id_param: setId }).then(({ data }) => {
      setSharedSongs((data as SharedSong[] | null) ?? []);
    });
  }

  useEffect(() => {
    fetchSharedSongs();
    const channel = supabase
      .channel(`set-song-panel-${setId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "set_collaborators", filter: `set_id=eq.${setId}` },
        () => fetchSharedSongs()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId, isSolo]);

  useEffect(() => {
    setSortMode("popular");
    setSelectedLeaders(new Set());
  }, [isSolo]);

  const inSetIds = new Set(currentSongIds);
  const sharedSongsMap = new Map((sharedSongs ?? []).map((s) => [s.song_id, s]));

  // Which songs to pick from: the ones the group knows, or the whole catalog,
  // both filterable with the Song Library's filters.
  const [source, setSource] = useState<"group" | "all">("group");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [meta, setMeta] = useState<SongMeta[]>([]);
  const [jamTags, setJamTags] = useState<{ name: string; type: string }[]>([]);
  useEffect(() => {
    supabase.rpc("song_filter_meta").then(({ data }) => setMeta((data ?? []) as SongMeta[]));
    // A set made for a jam starts from the jam's tags (Shabbat · Jewish) as suggestions.
    supabase.from("sets").select("jam_id").eq("id", setId).maybeSingle().then(async ({ data }) => {
      if (!data?.jam_id) return;
      const { data: rows } = await supabase.from("jam_tags").select("tags(name, type)").eq("jam_id", data.jam_id);
      setJamTags(((rows ?? []) as any[]).map((r) => r.tags).filter((t) => t && DIM_FOR_TYPE[t.type]));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setId]);
  const metaById = useMemo(() => new Map(meta.map((m) => [m.song_id, m])), [meta]);
  const sourceMeta = useMemo(
    () => (source === "group" ? meta.filter((m) => sharedSongsMap.has(m.song_id)) : meta),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meta, source, sharedSongs]
  );
  const hierarchy = useTagHierarchy();
  const filters = useSongFilters(sourceMeta, "popularity", hierarchy, { syncUrl: false });
  const { expandedState, activeFilterCount, matchesFilters } = filters;
  const browseFilters = useMemo<BrowseFilters>(() => ({
    genres: [...expandedState.genres], languages: [...expandedState.languages], themes: [...expandedState.themes],
    cultures: [...expandedState.cultures], forms: [...expandedState.forms], occasions: [...expandedState.occasions],
    communities: [...expandedState.communities], vibe: expandedState.vibe, tonality: expandedState.tonality, meter: expandedState.meter,
    yearMin: expandedState.yearMin, yearMax: expandedState.yearMax, excludeMine: false, sort: "popularity",
  }), [expandedState]);
  const { songs: catalogSongs, loading: catalogLoading } = useBrowseSongs(browseFilters, { pageSize: 50 });
  // In the whole catalog, songs more of the group knows come first.
  const groupCount = (id: string) => { const s = sharedSongsMap.get(id); return s ? s.who_else.length + (s.viewer_has ? 1 : 0) : 0; };
  const catalogRanked = useMemo(
    () => [...catalogSongs].sort((a, b) => groupCount(b.song_id) - groupCount(a.song_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [catalogSongs, sharedSongs]
  );

  function buildOptimistic(songId: string, hint: { title: string; display_artist: string | null; slug?: string | null; year?: number | null }) {
    return {
      id: `optimistic-${songId}`,
      song_id: songId,
      position: currentSongIds.length,
      key_note: null,
      notes: null,
      leader_user_ids: [],
      songs: {
        title: hint.title,
        display_artist: hint.display_artist ?? null,
        slug: hint.slug ?? null,
        chord_chart_url: null,
        youtube_url: null,
        tonality: null,
        year: hint.year ?? null,
        meter: null,
        song_composers: [],
        song_lyricists: [],
        song_tags: [],
        song_recording_artists: [],
      },
    };
  }

  async function submitAddSong(
    songId: string,
    confidence: string | null,
    hint: { title: string; display_artist: string | null; slug?: string | null; year?: number | null }
  ) {
    const optimisticId = `optimistic-${songId}`;
    setPendingSong(null);
    setSearchQuery("");
    setAddError(null);
    onSongAdding(buildOptimistic(songId, hint));
    const body: any = { songId };
    if (confidence) body.confidence = confidence;
    try {
      const res = await fetch(`/api/sets/${setId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const { song, knowledge } = await res.json();
        onSongAdded(optimisticId, song, knowledge ?? []);
        if (confidence) onRepertoireUpdated(songId, confidence);
      } else {
        onSongAddFailed(optimisticId);
        if (res.status !== 409) {
          const json = await res.json().catch(() => ({}));
          setAddError(json.error === "Song already in set" ? "That song is already in this set." : "Couldn't add song — please try again.");
        }
      }
    } catch {
      onSongAddFailed(optimisticId);
      setAddError("Couldn't add song — check your connection and try again.");
    }
  }

  function handleSearchSongSelect(song: any) {
    if (inSetIds.has(song.song_id)) return;
    const existing = userRepertoire.get(song.song_id);
    if (existing) {
      submitAddSong(song.song_id, null, song);
    } else {
      setPendingSong(song);
    }
  }

  async function handleAddSharedSong(s: SharedSong) {
    if (!canEdit || addingId) return;
    const optimisticId = `optimistic-${s.song_id}`;
    setAddingId(s.song_id);
    onSongAdding(buildOptimistic(s.song_id, s));
    const res = await fetch(`/api/sets/${setId}/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId: s.song_id }),
    });
    setAddingId(null);
    if (res.ok) {
      const { song, knowledge } = await res.json();
      onSongAdded(optimisticId, song, knowledge ?? []);
    } else if (res.status !== 409) {
      onSongAddFailed(optimisticId);
    }
  }

  async function submitMissingSong() {
    if (!missingSongTitle.trim()) return;
    setMissingSongBusy(true);
    setMissingSongError(null);
    try {
      const res = await fetch("/api/songs/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: missingSongTitle.trim(), artist: missingSongArtist.trim() }),
      });
      if (!res.ok) {
        setMissingSongError("Couldn't add song. Please try again.");
        setMissingSongBusy(false);
        return;
      }
      const json = await res.json();
      setShowMissingSong(false);
      setMissingSongBusy(false);
      handleSearchSongSelect({ song_id: json.id, title: missingSongTitle.trim(), display_artist: missingSongArtist.trim() || null });
    } catch {
      setMissingSongError("Something went wrong. Please try again.");
      setMissingSongBusy(false);
    }
  }

  const hasSharedSongs = sharedSongs !== null && sharedSongs.length > 0;

  if (!canEdit && !hasSharedSongs) return null;

  if (pendingSong) {
    return (
      <ConfidencePicker
        singingVoice={userSingingVoice}
        songTitle={pendingSong.title}
        onSave={(level) => submitAddSong(pendingSong.song_id, level, pendingSong)}
        onCancel={() => setPendingSong(null)}
        onVoiceUpdated={onVoiceUpdated}
      />
    );
  }

  const sorted = (hasSharedSongs ? displayedSongs(sharedSongs!, sortMode, selectedLeaders, isSolo) : [])
    .filter((s) => activeFilterCount === 0 || matchesFilters(metaById.get(s.song_id)));
  const leaderNames = hasSharedSongs
    ? Array.from(
        new Set(sharedSongs!.flatMap((s) => [...(s.viewer_leads ? ["You"] : []), ...s.who_else_leads]))
      ).sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : a.localeCompare(b)))
    : [];

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold">{canEdit ? "Add songs" : "Songs you share"}</h2>
        {!searchQuery && hasSharedSongs && source === "group" && (
          <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
            {(["popular", "alpha", "za", ...(!isSolo ? ["leader"] : [])] as SortMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => { setSortMode(mode); if (mode !== "leader") setSelectedLeaders(new Set()); }}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                  sortMode === mode ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {mode === "popular" ? "Popular" : mode === "alpha" ? "A → Z" : mode === "za" ? "Z → A" : "Leader"}
              </button>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <SearchInput
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setShowMissingSong(false);
            setMissingSongError(null);
            setAddError(null);
          }}
          onClear={() => {
            setSearchQuery("");
            setShowMissingSong(false);
            setMissingSongError(null);
            setAddError(null);
          }}
          placeholder="Search songs…"
        />
      )}

      {addError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{addError}</p>
      )}

      {canEdit && !searchQuery && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-0.5 rounded-lg bg-zinc-100 p-0.5">
              {([["group", isSolo ? "Your songs" : "Your group knows"], ["all", "All songs"]] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setSource(key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${source === key ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`h-7 rounded-full border px-3 text-xs font-medium transition-colors ${
                activeFilterCount > 0 ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
              }`}
            >
              Filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
            </button>
          </div>
          {jamTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-zinc-500">From the jam:</span>
              {jamTags.map((t) => {
                const dim = DIM_FOR_TYPE[t.type];
                const on = filters.selectedTags[dim].has(t.name);
                return (
                  <button
                    key={`${t.type}:${t.name}`}
                    onClick={() => filters.toggleTag(dim, t.name)}
                    aria-pressed={on}
                    className={`rounded-full border px-2.5 py-0.5 text-xs ${on ? "border-amber-400 bg-amber-50 text-amber-700" : "border-dashed border-zinc-300 text-zinc-600 hover:border-zinc-400"}`}
                  >
                    {on ? "✓ " : "+ "}{t.name}
                  </button>
                );
              })}
            </div>
          )}
          <ActiveFilterChips filters={filters} />
          {filtersOpen && <FilterPanel filters={filters} hierarchy={hierarchy} />}
        </div>
      )}

      {canEdit && searchQuery ? (
        <>
          {searching && <p className="text-xs text-zinc-400">Searching…</p>}
          {searchResults.length > 0 && (
            <ul className="divide-y divide-zinc-100 max-h-64 overflow-y-auto">
              {(searchResults as any[]).map((song) => {
                const shared = sharedSongsMap.get(song.song_id);
                const inSet = inSetIds.has(song.song_id);
                return (
                  <li key={song.song_id} className="flex items-start gap-3 py-2.5">
                    <AddButton
                      inSet={inSet}
                      isAdding={false}
                      onClick={() => handleSearchSongSelect(song)}
                    />
                    <div className={`min-w-0 flex-1 ${inSet ? "opacity-40" : ""}`}>
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-sm font-medium text-zinc-900">{song.title}</span>
                        <SongSubtitle productions={song.productions} artist={song.byline ?? song.display_artist} className="text-xs text-zinc-400" />
                      </div>
                      <RowPills meta={metaById.get(song.song_id)} />
                      {shared && <WhoKnows s={shared} />}
                      {inSet && <p className="text-xs text-zinc-400">Already in set</p>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {searchQuery.trim() && !searching && (
            showMissingSong ? (
              <div className="space-y-2 rounded-xl border border-zinc-200 p-3">
                <p className="text-sm font-medium text-zinc-700">Add a missing song</p>
                <input
                  value={missingSongTitle}
                  onChange={(e) => setMissingSongTitle(e.target.value)}
                  placeholder="Song title"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                <input
                  value={missingSongArtist}
                  onChange={(e) => setMissingSongArtist(e.target.value)}
                  placeholder="Recording artist (optional)"
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
                />
                {missingSongError && <p className="text-xs text-red-500">{missingSongError}</p>}
                {missingSongBusy && <p className="text-xs text-zinc-400">Looking up song info — this may take a moment…</p>}
                <div className="flex gap-2">
                  <button
                    onClick={submitMissingSong}
                    disabled={missingSongBusy || !missingSongTitle.trim()}
                    className="rounded-full bg-amber-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
                  >
                    {missingSongBusy ? "Adding…" : "Add song"}
                  </button>
                  <button
                    onClick={() => setShowMissingSong(false)}
                    disabled={missingSongBusy}
                    className="rounded-full border border-zinc-200 px-4 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {searchResults.length === 0 && <p className="text-xs text-zinc-400">No songs found.</p>}
                <button
                  onClick={() => { setShowMissingSong(true); setMissingSongTitle(searchQuery.trim()); setMissingSongArtist(""); }}
                  className="text-xs text-amber-600 hover:text-amber-700 transition-colors"
                >
                  Add a missing song →
                </button>
              </div>
            )
          )}
        </>
      ) : canEdit && source === "all" ? (
        catalogRanked.length === 0 ? (
          <p className="text-xs text-zinc-400">{catalogLoading ? "Loading…" : "No songs match these filters."}</p>
        ) : (
          <ul className={`divide-y divide-zinc-100 max-h-96 overflow-y-auto ${catalogLoading ? "opacity-60" : ""}`}>
            {catalogRanked.map((song) => {
              const shared = sharedSongsMap.get(song.song_id);
              const inSet = inSetIds.has(song.song_id);
              return (
                <li key={song.song_id} className="flex items-start gap-3 py-2.5">
                  <AddButton inSet={inSet} isAdding={false} onClick={() => handleSearchSongSelect(song)} />
                  <div className={`min-w-0 flex-1 ${inSet ? "opacity-40" : ""}`}>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <a href={`/songs/${song.slug ?? song.song_id}`} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zinc-900 hover:underline">
                        {song.title}
                      </a>
                      <SongSubtitle productions={song.productions} artist={song.byline ?? song.display_artist} className="text-xs text-zinc-400" />
                    </div>
                    <RowPills meta={metaById.get(song.song_id)} />
                    {shared && !isSolo && <WhoKnows s={shared} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : hasSharedSongs ? (
        <>
          {sortMode === "leader" && leaderNames.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {leaderNames.map((name) => (
                <button
                  key={name}
                  onClick={() =>
                    setSelectedLeaders((prev) => {
                      const next = new Set(prev);
                      next.has(name) ? next.delete(name) : next.add(name);
                      return next;
                    })
                  }
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    selectedLeaders.has(name) ? "bg-amber-500 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          )}

          <ul className="divide-y divide-zinc-100 max-h-96 overflow-y-auto">
            {sorted.map((s) => {
              const inSet = inSetIds.has(s.song_id);
              const isAdding = addingId === s.song_id;
              return (
                <li key={s.song_id} className="flex items-start gap-3 py-2.5">
                  {canEdit && (
                    <AddButton
                      inSet={inSet}
                      isAdding={isAdding}
                      onClick={() => handleAddSharedSong(s)}
                    />
                  )}
                  <div className={`min-w-0 flex-1 ${inSet ? "opacity-40" : ""}`}>
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      {s.slug ? (
                        <a
                          href={`/songs/${s.slug}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-zinc-900 hover:underline"
                        >
                          {s.title}
                        </a>
                      ) : (
                        <span className="text-sm font-medium text-zinc-900">{s.title}</span>
                      )}
                      <SongSubtitle productions={productionsBySong.get(s.song_id)} artist={s.display_artist} className="text-xs text-zinc-400" />
                    </div>
                    <RowPills meta={metaById.get(s.song_id)} />
                    {!isSolo && <WhoKnows s={s} />}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
