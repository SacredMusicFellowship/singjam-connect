"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { formatComposers } from "@/lib/formatComposers";
import { matchesSearch } from "@/lib/normalizeSearch";
import { mergeSuggestionsById } from "@/lib/mergeSuggestionsById";
import SubmitSongForm from "@/components/SubmitSongForm";
import { useSongFilters } from "@/hooks/useSongFilters";
import { useProgressiveRows } from "@/hooks/useProgressiveRows";
import { useScrollRestoration } from "@/hooks/useScrollRestoration";
import { useSongSearch, type SongSearchResult } from "@/hooks/useSongSearch";
import { sortRepertoireSearchResults } from "@/lib/sortRepertoireSearchResults";
import { SortDropdown } from "@/components/SortDropdown";
import { ActiveFilterChips, FilterPanel } from "@/components/FilterPanel";
import { matchedAlternateTitles } from "@singjam/core";
import { useTagHierarchy } from "@/hooks/useTagHierarchy";
import SongCard from "@/components/SongCard";
import AddToSetPanel from "@/components/AddToSetPanel";
import MyKeySelect from "@/components/MyKeySelect";
import { bulkAddStatus, type BulkStatus } from "@/lib/bulkAddStatus";
import { formatJammers, hasLeadVoice, LEAD_VOICE_UPGRADE, setsAcceptingSongs, type ProductionCredit, type RecordingArtistCredit } from "@singjam/core";
import ConfidencePicker from "@/components/ConfidencePicker";
import RoleSelect from "@/components/RoleSelect";
import ChordChartSlot from "@/components/ChordChartSlot";
import SearchInput from "@/components/SearchInput";
import Select from "@/components/Select";
import SongSubtitle from "@/components/SongSubtitle";

const CONFIDENCE_LEVELS = [
  { key: "lead", label: "Lead" },
  { key: "support", label: "Support" },
  { key: "learn", label: "Learn" },
] as const;

type ConfidenceKey = (typeof CONFIDENCE_LEVELS)[number]["key"];

const SORT_OPTIONS = [
  { value: "title_asc" as const, label: "A → Z" },
  { value: "title_desc" as const, label: "Z → A" },
  { value: "popularity" as const, label: "Popular" },
];

type Item = {
  song_id: string;
  byline?: string | null;
  slug: string | null;
  confidence: string | null;
  key_note: string | null;
  updated_at: string | null;
  title: string;
  display_artist: string | null;
  first_line: string | null;
  hook: string | null;
  notes: string | null;
  composers: string[];
  cultures: string[];
  productions: string[];
  genres: string[];
  languages: string[];
  themes: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
  popularity?: number;
  chord_chart_url?: string | null;
};

const CACHE_KEY = "cache:/repertoire";

type RepertoireCache = {
  uid: string;
  items: Item[];
  singingVoice: string | null;
  userSets: { id: string; name: string }[];
  suggestions: SuggestionResult[];
  suggestionsOffset: number;
  suggestionsHasMore: boolean;
};

type SuggestionResult = {
  song_id: string;
  byline?: string | null;
  title: string;
  display_artist: string | null;
  first_line: string | null;
  slug: string | null;
  composers: string[];
  cultures: string[];
  productions: string[];
  genres: string[];
  languages: string[];
  communities?: string[];
  year: number | null;
  popularity: number;
  youtube_id: string | null;
  spotify_track_id: string | null;
  recording_artists?: RecordingArtistCredit[] | null;
  production_credits?: ProductionCredit[] | null;
};

type AddableSong = {
  slug: string | null;
  title: string;
  display_artist: string | null;
  first_line: string | null;
  composers: string[];
  cultures: string[];
  productions: string[];
  genres: string[];
  languages: string[] | null;
};


function SuggestionsPanel({
  suggestions,
  pendingAddId,
  setPendingAddId,
  singingVoice,
  onAddSong,
  onVoiceUpdated,
  onLoadMore,
  hasMore,
  loadingMore,
}: {
  suggestions: SuggestionResult[];
  pendingAddId: string | null;
  setPendingAddId: (id: string | null) => void;
  singingVoice: string | null;
  onAddSong: (songId: string, level: string, suggestion: SuggestionResult) => void;
  onVoiceUpdated: (voice: string) => void;
  onLoadMore: () => void;
  hasMore: boolean;
  loadingMore: boolean;
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onLoadMore(); },
      { threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

  return (
    <div>
      <p className="px-1 text-sm font-medium text-zinc-500">Songs you might know</p>
      <div className="mt-2 grid gap-2">
        {suggestions.map((s) => (
          <SongCard
            key={s.song_id}
            songId={s.song_id}
            slug={s.slug}
            title={s.title}
            displayArtist={s.display_artist}
            byline={s.byline}
            composers={s.composers}
            cultures={[...s.cultures, ...(s.communities ?? [])]}
            productions={s.productions}
            recordingArtists={s.recording_artists}
            productionCredits={s.production_credits}
            aka={null}
            genres={s.genres}
            communities={s.communities}
            languages={s.languages}
            popularity={s.popularity}
            youtubeId={s.youtube_id}
            spotifyTrackId={s.spotify_track_id}
            repertoire={new Map()}
            pendingAddId={pendingAddId}
            singingVoice={singingVoice}
            setPendingAddId={setPendingAddId}
            onAdd={(songId) => setPendingAddId(songId)}
            addSong={(songId, level) => onAddSong(songId, level, s)}
            onVoiceUpdated={onVoiceUpdated}
          />
        ))}
        {hasMore && (
          <div ref={sentinelRef} className="p-3 text-center text-xs text-zinc-400">
            {loadingMore ? "Loading…" : ""}
          </div>
        )}
      </div>
    </div>
  );
}

type RowActions = {
  toggleSelect: (songId: string) => void;
  updateConfidence: (songId: string, level: string) => void;
  updateKey: (songId: string, key: string | null) => void;
  loadSetMemberships: (songId: string) => void;
  saveScroll: () => void;
  addedToSet: (songId: string, setId: string) => void;
  setCreated: (set: { id: string; name: string }) => void;
  chartAdded: (songId: string, url: string) => void;
};

const RepertoireRow = memo(function RepertoireRow({
  it,
  selectable,
  selected,
  userSets,
  inSets,
  canAddCharts,
  actions,
}: {
  it: Item;
  selectable: boolean;
  selected: boolean;
  userSets: { id: string; name: string }[];
  inSets: Set<string> | undefined;
  canAddCharts: boolean;
  actions: RowActions;
}) {
  return (
  <div
    className={`flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between transition-colors ${
      !selectable ? "rounded-md border" : selected ? "bg-amber-50/60" : ""
    }`}
  >
    <div className="flex min-w-0 items-start gap-3">
      {selectable && <input
        type="checkbox"
        checked={selected}
        onChange={() => actions.toggleSelect(it.song_id)}
        className="mt-1 h-4 w-4 flex-shrink-0 cursor-pointer rounded border-zinc-300 accent-amber-500"
        aria-label={`Select ${it.title}`}
      />}
      <div className="min-w-0">
        <div className="line-clamp-2 font-medium">
          <Link href={`/songs/${it.slug ?? it.song_id}`} onClick={() => actions.saveScroll()} className="hover:text-amber-600">
            {it.title}
          </Link>
          {it.composers.length > 0 && (
            <span className="ml-1 font-normal text-slate-400">
              ({formatComposers(it.composers, [...it.cultures, ...(it.communities ?? [])])})
            </span>
          )}
        </div>
        <SongSubtitle productions={it.productions} artist={it.byline ?? it.display_artist} fallback="—" className="block truncate text-sm text-zinc-500" />
        {(it.popularity ?? 0) > 0 && (
          <div className="text-xs text-zinc-400">{formatJammers(it.popularity ?? 0)}</div>
        )}
      </div>
    </div>

    <div className="relative flex flex-wrap items-center gap-1.5 sm:gap-2 sm:shrink-0">
      <RoleSelect value={it.confidence ?? "learn"} onChange={(level) => actions.updateConfidence(it.song_id, level)} size="md" label={`Role for ${it.title}`} />

      <MyKeySelect value={it.key_note} onChange={(k) => actions.updateKey(it.song_id, k)} size="md" label={`My key for ${it.title}`} />

      {userSets.length > 0 && (
        <AddToSetPanel
          songId={it.song_id}
          sets={userSets}
          inSets={inSets}
          onOpen={() => actions.loadSetMemberships(it.song_id)}
          onAdded={(setId) => actions.addedToSet(it.song_id, setId)}
          onSetCreated={(set) => actions.setCreated(set)}
        />
      )}

      <ChordChartSlot
        songId={it.song_id}
        url={it.chord_chart_url}
        canAdd={canAddCharts}
        size="md"
        onAdded={(url) => actions.chartAdded(it.song_id, url)}
      />

    </div>
  </div>
  );
});

export default function RepertoirePage() {
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSignedIn, setIsSignedIn] = useState<boolean | null>(null);
  // Admins and song editors can attach a missing chord chart, as on the set list.
  const [canAddCharts, setCanAddCharts] = useState(false);
  const [singingVoice, setSingingVoice] = useState<string | null>(null);

  const [items, setItems] = useState<Item[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestionResult[]>([]);
  const [suggestionsOffset, setSuggestionsOffset] = useState(0);
  const [suggestionsHasMore, setSuggestionsHasMore] = useState(true);
  const [suggestionsLoadingMore, setSuggestionsLoadingMore] = useState(false);
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [confidenceFilter, setConfidenceFilter] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return new URLSearchParams(window.location.search).get("role") ?? "all";
  });
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [pendingAddId, setPendingAddId] = useState<string | null>(null);
  const [userSets, setUserSets] = useState<{ id: string; name: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkRemoveConfirm, setBulkRemoveConfirm] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<BulkStatus | null>(null);
  const [bulkSetId, setBulkSetId] = useState("");
  const [bulkConfidenceLevel, setBulkConfidenceLevel] = useState("");
  const [newSetName, setNewSetName] = useState("");
  const [songSetMemberships, setSongSetMemberships] = useState<Record<string, Set<string>>>({});
  const [bulkCreatingSet, setBulkCreatingSet] = useState(false);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const loadingMoreRef = useRef(false);
  const { results: searchResults, loading: searchLoading } = useSongSearch(query);

  const [isPending, startTransition] = useTransition();

  const hierarchy = useTagHierarchy();
  const filters = useSongFilters(items, "title_asc", hierarchy);
  const { matchesFilters, activeFilterCount, clearFilters, sortBy, setSortBy } = filters;

  const saveScrollPosition = useScrollRestoration(
    "scroll:/repertoire",
    !loading && (!query.trim() || (!searchLoading && searchResults.length > 0))
  );

  // Show the cached repertoire immediately on return visits (the fresh fetch
  // below still runs and silently replaces it). Layout effect so the cached
  // rows paint on the first frame, letting scroll restoration land on them.
  const hydratedUidRef = useRef<string | null>(null);
  // With cached rows the page is interactive while the refresh is in flight;
  // a mutation during that window must not be clobbered by the older fetch.
  const itemsMutatedRef = useRef(false);
  useLayoutEffect(() => {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return;
      const c = JSON.parse(raw) as RepertoireCache;
      if (!c.uid || !Array.isArray(c.items)) return;
      hydratedUidRef.current = c.uid;
      setUserId(c.uid);
      setIsSignedIn(true);
      setSingingVoice(c.singingVoice ?? null);
      setUserSets(c.userSets ?? []);
      setSuggestions(c.suggestions ?? []);
      setSuggestionsOffset(c.suggestionsOffset ?? 0);
      setSuggestionsHasMore(c.suggestionsHasMore ?? true);
      setItems(c.items);
      setLoading(false);
    } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        if (!hydratedUidRef.current) setLoading(true);

        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!data.session) {
          sessionStorage.removeItem(CACHE_KEY);
          setItems([]);
          setIsSignedIn(false);
          setLoading(false);
          return;
        }
        setIsSignedIn(true);

        const uid = data.session.user.id;
        setUserId(uid);
        if (hydratedUidRef.current && hydratedUidRef.current !== uid) {
          sessionStorage.removeItem(CACHE_KEY);
          hydratedUidRef.current = null;
          setItems([]);
          setSuggestions([]);
          setLoading(true);
        }

        const [{ data: p }, repertoireRes, setsJson, suggestionsRes] = await Promise.all([
          supabase.from("profiles").select("singing_voice, role").eq("id", uid).single(),
          supabase.rpc("my_repertoire"),
          fetch("/api/sets").then((r) => (r.ok ? r.json() : { owned: [], collaborating: [] })),
          supabase.rpc("suggest_songs_for_user", { p_user_id: uid, p_limit: 20 }),
        ]);
        if (repertoireRes.error) throw repertoireRes.error;

        setSingingVoice((p as any)?.singing_voice ?? null);
        setCanAddCharts(true);
        setUserSets(setsAcceptingSongs([...(setsJson.owned ?? []), ...(setsJson.collaborating ?? [])]));
        const initialSuggestions = (suggestionsRes.data ?? []) as SuggestionResult[];
        setSuggestions(initialSuggestions);
        setSuggestionsOffset(initialSuggestions.length);
        setSuggestionsHasMore(initialSuggestions.length === 20);

        if (cancelled) return;

        const flattened: Item[] = ((repertoireRes.data ?? []) as any[]).map((r) => ({
          song_id: r.song_id,
          slug: r.slug ?? null,
          confidence: r.confidence,
          key_note: r.key_note ?? null,
          updated_at: r.updated_at,
          title: r.title,
          display_artist: r.display_artist,
          byline: r.byline ?? null,
          first_line: r.first_line ?? null,
          hook: r.hook ?? null,
          notes: r.notes ?? null,
          vibe: r.vibe ?? null,
          tonality: r.tonality ?? null,
          meter: r.meter ?? null,
          year: r.year ?? null,
          composers: r.composers ?? [],
          cultures: r.cultures ?? [],
          productions: r.productions ?? [],
          genres: r.genres ?? [],
          languages: r.languages ?? [],
          themes: r.themes ?? [],
          forms: r.forms ?? [],
          occasions: r.occasions ?? [],
          communities: r.communities ?? [],
          popularity: r.popularity ?? 0,
          chord_chart_url: r.chord_chart_url ?? null,
        }));

        if (!itemsMutatedRef.current) {
          setItems(flattened.sort((a, b) => a.title.localeCompare(b.title)));
        }
      } catch (e: any) {
        console.error("Repertoire load exception:", e);
        // keep showing cached rows if the background refresh fails
        if (!hydratedUidRef.current) {
          setErrorMsg("Something went wrong. Please try again.");
          setItems([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading || !isSignedIn || !userId) return;
    const cache: RepertoireCache = {
      uid: userId,
      items,
      singingVoice,
      userSets,
      suggestions,
      suggestionsOffset,
      suggestionsHasMore,
    };
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {}
  }, [loading, isSignedIn, userId, items, singingVoice, userSets, suggestions, suggestionsOffset, suggestionsHasMore]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (query) { params.set("q", query); } else { params.delete("q"); }
    if (confidenceFilter !== "all") { params.set("role", confidenceFilter); } else { params.delete("role"); }
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [query, confidenceFilter]);

  const repertoireMap = useMemo(() => new Map(items.map((it) => [it.song_id, it])), [items]);
  const searching = query.trim().length > 0;

  // One row for a song already in the repertoire, used by both the list and
  // search results so the two can't drift apart. Selection is list-only.
  // Handlers the rows call. The object never changes identity (each entry calls
  // the latest handler), so a memoized row only redraws when its own song,
  // selection or set membership changes — not on every edit or batch.
  const rowHandlers = useRef<RowActions>(null!);
  const rowActions = useMemo<RowActions>(
    () => ({
      toggleSelect: (id) => rowHandlers.current.toggleSelect(id),
      updateConfidence: (id, level) => rowHandlers.current.updateConfidence(id, level),
      updateKey: (id, key) => rowHandlers.current.updateKey(id, key),
      loadSetMemberships: (id) => rowHandlers.current.loadSetMemberships(id),
      saveScroll: () => rowHandlers.current.saveScroll(),
      addedToSet: (songId, setId) => rowHandlers.current.addedToSet(songId, setId),
      setCreated: (set) => rowHandlers.current.setCreated(set),
      chartAdded: (songId, url) => rowHandlers.current.chartAdded(songId, url),
    }),
    []
  );

  // One row for a song already in the repertoire, used by both the list and
  // search results so the two can't drift apart. Selection is list-only.
  const renderRepertoireRow = (it: Item, selectable: boolean) => (
    <RepertoireRow
      key={it.song_id}
      it={it}
      selectable={selectable}
      selected={selectable && selectedIds.has(it.song_id)}
      userSets={userSets}
      inSets={songSetMemberships[it.song_id]}
      canAddCharts={canAddCharts}
      actions={rowActions}
    />
  );

  const sortedSearchResults = useMemo(
    () => searching
      ? sortRepertoireSearchResults(searchResults, new Set(repertoireMap.keys()))
      : searchResults,
    [searchResults, repertoireMap, searching]
  );

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (confidenceFilter !== "all" && (it.confidence ?? "") !== confidenceFilter) return false;
      if (!matchesFilters(it)) return false;
      const hay = [it.title, it.display_artist ?? "", ...it.composers, ...it.productions, it.first_line ?? "", it.hook ?? "", it.notes ?? ""].join(" ");
      return matchesSearch(hay, query);
    });
  }, [items, query, confidenceFilter, matchesFilters]);

  const sortedFiltered = useMemo(() => {
    const list = [...filtered];
    if (sortBy === "popularity") return list.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.title.localeCompare(b.title));
    if (sortBy === "title_desc") return list.sort((a, b) => b.title.localeCompare(a.title));
    return list.sort((a, b) => a.title.localeCompare(b.title));
  }, [filtered, sortBy]);
  const rowsToDraw = useProgressiveRows(sortedFiltered.length, "scroll:/repertoire");

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    const visibleIds = sortedFiltered.map((it) => it.song_id);
    const someSelected = visibleIds.some((id) => selectedIds.has(id));
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    el.indeterminate = someSelected && !allSelected;
  }, [sortedFiltered, selectedIds]);

  function toggleSelect(songId: string) {
    setBulkRemoveConfirm(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId);
      else next.add(songId);
      return next;
    });
  }

  function toggleSelectAll() {
    setBulkRemoveConfirm(false);
    const visibleIds = sortedFiltered.map((it) => it.song_id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(visibleIds));
    }
  }

  // One request for the whole selection. Select-all is unbounded — it takes the
  // entire filtered repertoire — so a request per song meant hundreds of
  // concurrent calls from one click. They also each read the same max(position)
  // before any of them inserted, so the songs could land on duplicate positions;
  // every read orders by position with no tiebreaker, which would have made
  // their order arbitrary. The endpoint numbers a batch server-side in one pass.
  async function bulkAddToSet(setId: string) {
    const ids = Array.from(selectedIds);
    const name = userSets.find((s) => s.id === setId)?.name ?? "set";
    setBulkSetId("");

    // The whole selection now lands or doesn't, so a false "Added" would claim
    // every song made it when none did.
    let status: BulkStatus;
    try {
      const res = await fetch(`/api/sets/${setId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds: ids }),
      });
      status = bulkAddStatus(name, res);
    } catch {
      status = bulkAddStatus(name, null);
    }

    setBulkStatus(status);
    setTimeout(() => setBulkStatus(null), status.ok ? 2500 : 5000);
  }

  // A role dropdown can't hold ConfidencePicker's inline question, so choosing
  // Lead without lead vocals on the profile asks here instead; yes adds them.
  async function leadVoiceOk(level: string) {
    if (level !== "lead" || hasLeadVoice(singingVoice) || !userId) return true;
    if (!window.confirm("Do you sing lead? We'll add lead vocals to your profile.")) return false;
    const { error } = await supabase.from("profiles").update({ singing_voice: LEAD_VOICE_UPGRADE }).eq("id", userId);
    if (error) { alert(error.message); return false; }
    setSingingVoice(LEAD_VOICE_UPGRADE);
    return true;
  }

  async function bulkUpdateConfidence(level: string) {
    if (!userId) return;
    if (!(await leadVoiceOk(level))) { setBulkConfidenceLevel(""); return; }
    const ids = Array.from(selectedIds);
    setBulkConfidenceLevel("");
    itemsMutatedRef.current = true;
    setItems((cur) => cur.map((it) => (ids.includes(it.song_id) ? { ...it, confidence: level } : it)));
    startTransition(async () => {
      const { error } = await supabase
        .from("user_songs")
        .update({ confidence: level })
        .eq("user_id", userId)
        .in("song_id", ids);
      if (error) alert(error.message);
    });
  }

  function bulkRemove() {
    if (!userId) return;
    const ids = Array.from(selectedIds);
    const prevItems = items;
    itemsMutatedRef.current = true;
    setItems((prev) => prev.filter((x) => !ids.includes(x.song_id)));
    setBulkRemoveConfirm(false);
    startTransition(async () => {
      const { error } = await supabase
        .from("user_songs")
        .delete()
        .eq("user_id", userId)
        .in("song_id", ids);
      if (error) { alert(error.message); setItems(prevItems); }
    });
  }

  async function createSetAndBulkAdd(name: string) {
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { alert("Failed to create set"); return; }
    const { id } = await res.json();
    setUserSets((prev) => [{ id, name }, ...prev]);
    setBulkCreatingSet(false);
    setNewSetName("");
    await bulkAddToSet(id);
  }

  const updateConfidence = async (song_id: string, next: string) => {
    if (!userId) return;
    if (!(await leadVoiceOk(next))) return;
    const prev = items.find((x) => x.song_id === song_id)?.confidence ?? null;
    itemsMutatedRef.current = true;
    setItems((cur) => cur.map((it) => (it.song_id === song_id ? { ...it, confidence: next } : it)));
    startTransition(async () => {
      const { error } = await supabase
        .from("user_songs")
        .update({ confidence: next })
        .eq("user_id", userId)
        .eq("song_id", song_id);
      if (error) {
        setItems((cur) => cur.map((it) => (it.song_id === song_id ? { ...it, confidence: prev } : it)));
        alert(error.message);
      }
    });
  };

  const updateKey = (song_id: string, next: string | null) => {
    if (!userId) return;
    const prev = items.find((x) => x.song_id === song_id)?.key_note ?? null;
    itemsMutatedRef.current = true;
    setItems((cur) => cur.map((it) => (it.song_id === song_id ? { ...it, key_note: next } : it)));
    startTransition(async () => {
      const { error } = await supabase
        .from("user_songs")
        .update({ key_note: next })
        .eq("user_id", userId)
        .eq("song_id", song_id);
      if (error) {
        setItems((cur) => cur.map((it) => (it.song_id === song_id ? { ...it, key_note: prev } : it)));
        alert(error.message);
      }
    });
  };

  rowHandlers.current = {
    toggleSelect,
    updateConfidence,
    updateKey,
    loadSetMemberships,
    saveScroll: () => saveScrollPosition(),
    addedToSet: (songId, setId) =>
      setSongSetMemberships((prev) => ({ ...prev, [songId]: new Set([...(prev[songId] ?? []), setId]) })),
    setCreated: (set) => setUserSets((prev) => [set, ...prev]),
    chartAdded: (songId, url) =>
      setItems((prev) => prev.map((x) => (x.song_id === songId ? { ...x, chord_chart_url: url } : x))),
  };

  const addSong = (songId: string, confidence: string, result: AddableSong) => {
    if (!userId) return;
    const prevItems = items;
    const prevSuggestions = suggestions;
    setPendingAddId(null);
    itemsMutatedRef.current = true;
    setSuggestions((prev) => prev.filter((s) => s.song_id !== songId));
    setItems((prev) => {
      if (prev.find((x) => x.song_id === songId)) {
        return prev.map((x) => x.song_id === songId ? { ...x, confidence } : x);
      }
      const newItem: Item = {
        song_id: songId,
        slug: result.slug ?? null,
        confidence,
        key_note: null,
        updated_at: new Date().toISOString(),
        title: result.title,
        display_artist: result.display_artist ?? null,
        first_line: result.first_line ?? null,
        hook: null,
        notes: null,
        composers: result.composers ?? [],
        cultures: result.cultures ?? [],
        productions: result.productions ?? [],
        genres: result.genres ?? [],
        languages: result.languages ?? [] as string[],
        themes: [],
        forms: [],
        occasions: [],
        communities: [],
        vibe: null,
        tonality: null,
        meter: null,
        year: null,
      };
      return [...prev, newItem].sort((a, b) => a.title.localeCompare(b.title));
    });
    startTransition(async () => {
      const { error } = await supabase.from("user_songs").upsert(
        { user_id: userId, song_id: songId, confidence, updated_at: new Date().toISOString() },
        { onConflict: "user_id,song_id" }
      );
      if (error) {
        alert(error.message);
        setItems(prevItems);
        setSuggestions(prevSuggestions);
      }
    });
  };

  async function loadSetMemberships(songId: string) {
    if (songSetMemberships[songId] !== undefined) return;
    const { data } = await supabase.from("set_songs").select("set_id").eq("song_id", songId);
    if (data) {
      setSongSetMemberships((prev) => ({ ...prev, [songId]: new Set(data.map((r: any) => r.set_id)) }));
    }
  }

  const loadMoreSuggestions = useCallback(async () => {
    if (!suggestionsHasMore || loadingMoreRef.current || !userId) return;
    loadingMoreRef.current = true;
    setSuggestionsLoadingMore(true);
    const { data } = await supabase.rpc("suggest_songs_for_user", {
      p_user_id: userId,
      p_limit: 20,
      p_offset: suggestionsOffset,
    });
    if (data) {
      const page = data as SuggestionResult[];
      setSuggestions((prev) => mergeSuggestionsById(prev, page));
      setSuggestionsOffset((prev) => prev + page.length);
      setSuggestionsHasMore(page.length === 20);
    }
    loadingMoreRef.current = false;
    setSuggestionsLoadingMore(false);
  }, [suggestionsHasMore, userId, suggestionsOffset, supabase]);

  if (!loading && isSignedIn === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">My Repertoire</h1>
          <p className="mt-1 text-sm text-zinc-500">Every song you know or want to learn.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-zinc-900">Track the songs you know</p>
          <p className="mt-2 text-sm text-zinc-500">
            Add songs to your repertoire — as a lead, support, or something you&apos;re learning — and SingJam will match you with musicians who share your songs.
          </p>
          <Link href="/auth?next=/repertoire" className="mt-4 inline-block text-sm font-medium text-amber-600 hover:text-amber-500">
            Sign in →
          </Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-semibold">My Repertoire</h1>
          <div className="mt-1 h-3 w-16 animate-pulse rounded bg-zinc-200" />
        </div>
        <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
          <div className="h-9 animate-pulse rounded-xl bg-zinc-100" />
        </div>
        <div className="divide-y rounded-md border">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="flex items-center justify-between p-4">
              <div className="space-y-1.5">
                <div className="h-4 w-48 animate-pulse rounded bg-zinc-200" />
                <div className="h-3 w-32 animate-pulse rounded bg-zinc-100" />
              </div>
              <div className="h-8 w-24 animate-pulse rounded-xl bg-zinc-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">My Repertoire</h1>
        <p className="text-sm text-zinc-500">
          {items.length} song{items.length === 1 ? "" : "s"}
          {isPending ? "…" : ""}
        </p>
      </div>

      {errorMsg ? (
        <pre className="whitespace-pre-wrap rounded-md border border-red-300 bg-red-50 p-3 text-xs text-red-700">
          {errorMsg}
        </pre>
      ) : null}

      {/* Search bar — always visible */}
      <div className="rounded-2xl border border-zinc-200 p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onClear={() => setQuery("")}
              placeholder="Search by title, songwriter, or artist…"
            />
          </div>

          {!searching && (
            <Select
              value={confidenceFilter}
              onChange={(e) => setConfidenceFilter(e.target.value)}
              wrapperClassName="w-full sm:w-56"
            >
              <option value="all">Any role</option>
              {CONFIDENCE_LEVELS.map((l) => (
                <option key={l.key} value={l.key}>{l.label}</option>
              ))}
            </Select>
          )}
        </div>
      </div>

      {/* Search results mode */}
      {searching ? (
        <>
          <div className="text-sm text-zinc-500 px-1">
            {searchLoading ? "Searching…" : `${sortedSearchResults.length} result${sortedSearchResults.length === 1 ? "" : "s"}`}
          </div>
          <div
            className="grid gap-2"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest('a[href^="/songs/"]')) saveScrollPosition();
            }}
          >
            {!searchLoading && sortedSearchResults.length === 0 ? (
              <div className="rounded-md border p-4 text-sm text-zinc-500">No songs found.</div>
            ) : (
              sortedSearchResults.map((result) => {
                const inRep = repertoireMap.get(result.song_id);

                if (!inRep) {
                  return (
                    <SongCard
                      key={result.song_id}
                      songId={result.song_id}
                      slug={result.slug}
                      title={result.title}
                      displayArtist={result.display_artist}
                      byline={result.byline}
                      composers={result.composers}
                      cultures={[...(result.cultures ?? []), ...(result.communities ?? [])]}
                      productions={result.productions}
                      recordingArtists={result.recording_artists}
                      productionCredits={result.production_credits}
                      aka={matchedAlternateTitles(result.aka, query, result.title)}
                      genres={result.genres}
                      forms={result.forms}
                      occasions={result.occasions}
                      communities={result.communities}
                      languages={result.languages ?? []}
                      youtubeId={result.youtube_id}
                      spotifyTrackId={result.spotify_track_id}
                      repertoire={new Map()}
                      pendingAddId={pendingAddId}
                      singingVoice={singingVoice}
                      setPendingAddId={setPendingAddId}
                      onAdd={(songId) => setPendingAddId(songId)}
                      addSong={(songId, level) => addSong(songId, level, result)}
                      onVoiceUpdated={(voice) => setSingingVoice(voice)}
                    />
                  );
                }

                return renderRepertoireRow(inRep, false);
              })
            )}
          </div>
          <SubmitSongForm />
        </>
      ) : items.length === 0 ? (
        <>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
            <p className="text-base font-semibold text-zinc-900">Your repertoire is empty</p>
            <p className="mt-1 text-sm text-zinc-500">Add songs you know and SingJam will match you with musicians who share your repertoire.</p>
            <p className="mt-3 text-sm text-zinc-400">Search for a song above, or pick one from the suggestions below.</p>
          </div>
          {suggestions.length > 0 && (
            <SuggestionsPanel
              suggestions={suggestions}
              pendingAddId={pendingAddId}
              setPendingAddId={setPendingAddId}
              singingVoice={singingVoice}
              onAddSong={(songId, level, suggestion) => addSong(songId, level, suggestion)}
              onVoiceUpdated={(voice) => setSingingVoice(voice)}
              onLoadMore={loadMoreSuggestions}
              hasMore={suggestionsHasMore}
              loadingMore={suggestionsLoadingMore}
            />
          )}
        </>
      ) : (
        <>
          {/* Filter bar */}
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wide px-1">
              {sortedFiltered.length} of {items.length}
            </p>
            <div className="flex items-center gap-2">
              <SortDropdown value={sortBy} onChange={setSortBy} options={SORT_OPTIONS} />
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
            </div>
          </div>

          {/* Bulk action bar. Its wrapper is always rendered: the page's space-y
              spacing is a sibling selector, so inserting the bar as a sibling of
              the list made the browser restyle every row (~1.2s on a phone). */}
          <div className="contents">
            {selectedIds.size > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <span className="text-sm font-medium text-amber-800">
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="text-xs text-amber-700 underline underline-offset-2"
                >
                  Deselect all
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {bulkStatus ? (
                    <span
                      role={bulkStatus.ok ? undefined : "alert"}
                      className={`text-xs ${bulkStatus.ok ? "text-green-700" : "text-red-600"}`}
                    >
                      {bulkStatus.text}
                    </span>
                  ) : null}
                  {userSets.length > 0 && (
                    bulkCreatingSet ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={newSetName}
                          onChange={(e) => setNewSetName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && newSetName.trim()) createSetAndBulkAdd(newSetName.trim());
                            if (e.key === "Escape") { setBulkCreatingSet(false); setNewSetName(""); }
                          }}
                          placeholder="Set name…"
                          autoFocus
                          className="w-28 rounded-xl border border-zinc-300 px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
                        />
                        <button
                          onClick={() => { if (newSetName.trim()) createSetAndBulkAdd(newSetName.trim()); }}
                          disabled={!newSetName.trim()}
                          className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40"
                        >
                          Create
                        </button>
                        <button
                          onClick={() => { setBulkCreatingSet(false); setNewSetName(""); }}
                          className="text-zinc-400 hover:text-zinc-600 text-sm"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <Select
                        value={bulkSetId}
                        onChange={(e) => {
                          if (e.target.value === "__new__") { setBulkCreatingSet(true); setBulkSetId(""); }
                          else if (e.target.value) bulkAddToSet(e.target.value);
                        }}
                        shape="pill"
                        size="sm"
                      >
                        <option value="">Add to set…</option>
                        {userSets.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                        <option value="__new__">+ New set…</option>
                      </Select>
                    )
                  )}
                  <Select
                    value={bulkConfidenceLevel}
                    onChange={(e) => { if (e.target.value) bulkUpdateConfidence(e.target.value); }}
                    shape="pill"
                    size="sm"
                  >
                    <option value="">Change role…</option>
                    {CONFIDENCE_LEVELS.map((l) => (
                      <option
                        key={l.key}
                        value={l.key}
                      >
                        {l.label}
                      </option>
                    ))}
                  </Select>
                  {bulkRemoveConfirm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-700">
                        Remove {selectedIds.size} song{selectedIds.size === 1 ? "" : "s"}?
                      </span>
                      <button
                        onClick={bulkRemove}
                        className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setBulkRemoveConfirm(false)}
                        className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setBulkRemoveConfirm(true)}
                      className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <ActiveFilterChips filters={filters} />

          {filtersOpen && (
            <FilterPanel filters={filters} hierarchy={hierarchy} />
          )}

          <div className="divide-y rounded-md border">
            {sortedFiltered.length === 0 ? (
              <div className="p-4 text-center">
                <p className="text-sm text-zinc-500">No songs match these filters.</p>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters} className="mt-3 text-sm font-medium text-amber-600 hover:underline">
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 bg-zinc-50 px-4 py-2">
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    checked={sortedFiltered.length > 0 && sortedFiltered.every((it) => selectedIds.has(it.song_id))}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 cursor-pointer rounded border-zinc-300 accent-amber-500"
                    aria-label="Select all"
                  />
                  <span className="text-xs text-zinc-400">Select all</span>
                </div>
                {sortedFiltered.slice(0, rowsToDraw).map((it) => renderRepertoireRow(it, true))}
              </>
            )}
          </div>

          {suggestions.length > 0 && (
            <SuggestionsPanel
              suggestions={suggestions}
              pendingAddId={pendingAddId}
              setPendingAddId={setPendingAddId}
              singingVoice={singingVoice}
              onAddSong={(songId, level, suggestion) => addSong(songId, level, suggestion)}
              onVoiceUpdated={(voice) => setSingingVoice(voice)}
              onLoadMore={loadMoreSuggestions}
              hasMore={suggestionsHasMore}
              loadingMore={suggestionsLoadingMore}
            />
          )}
        </>
      )}
    </div>
  );
}
