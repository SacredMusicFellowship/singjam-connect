import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, RefreshControl, Alert, Platform, ActivityIndicator } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { mergeSuggestionsById, songMatchesFilters, deriveFilterOptions, deriveFilterFacets, expandFilterState, countActiveFilters, sortRepertoireSearchResults, type UserSong, type SongFilterState, type CardIdentity, type RecordingArtistCredit } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import { ensureLeadVoice } from '@/lib/leadVoice';
import { readCache, writeCache } from '@/lib/cache';
import { useAuth } from '@/lib/auth-context';
import SongFilterSheet, { emptyFilterDimensions } from '@/components/SongFilterSheet';
import { useTagHierarchy } from '@/lib/useTagHierarchy';
import InlineDropdown from '@/components/InlineDropdown';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import RepertoireCard from '@/components/RepertoireCard';
import KeyPicker from '@/components/KeyPicker';
import SuggestionCard, { type Suggestion } from '@/components/SuggestionCard';
import SubmitMissingSong from '@/components/SubmitMissingSong';
import AddToSetModal from '@/components/AddToSetModal';
import BrandHeader from '@/components/BrandHeader';
import ContentContainer from '@/components/ContentContainer';
import PromptCard from '@/components/PromptCard';
import FiltersButton from '@/components/FiltersButton';

// ── Types ─────────────────────────────────────────────────────────────────────

type RichUserSong = UserSong & {
  byline?: string | null;
  card_identity?: CardIdentity;
  recording_artists?: RecordingArtistCredit[] | null;
  chord_chart_url?: string | null;
  genres: string[];
  languages: string[];
  themes: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  productions: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
  popularity: number;
};

type ConfidenceFilter = 'all' | 'lead' | 'support' | 'learn';
type SortOrder = 'title_asc' | 'title_desc' | 'popularity';

// ── Constants (mirror web repertoire/page.tsx) ────────────────────────────────

const CONFIDENCE_LEVELS: { key: Exclude<ConfidenceFilter, 'all'>; label: string }[] = [
  { key: 'lead', label: 'Lead' },
  { key: 'support', label: 'Support' },
  { key: 'learn', label: 'Learn' },
];

const SORT_OPTIONS: { key: SortOrder; label: string }[] = [
  { key: 'title_asc', label: 'A–Z' },
  { key: 'title_desc', label: 'Z–A' },
  { key: 'popularity', label: 'Popular' },
];

// Used for the selection set, not filters — the filter sheet toggles its own.
function toggleSet(set: Set<string>, value: string): Set<string> {
  const next = new Set(set);
  next.has(value) ? next.delete(value) : next.add(value);
  return next;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View className="mx-4 border-x border-b border-zinc-200 bg-white p-4">
      <View className="h-4 bg-zinc-200 rounded w-2/3 mb-2" />
      <View className="h-3 bg-zinc-100 rounded w-1/2 mb-3" />
      <View className="flex-row gap-2 ml-8">
        <View className="h-8 w-20 bg-zinc-100 rounded-xl" />
        <View className="h-8 w-20 bg-zinc-100 rounded-xl" />
      </View>
    </View>
  );
}

// ── Data loading ──────────────────────────────────────────────────────────────

// Same my_repertoire() RPC web's /repertoire uses (single source of truth per
// the parity rule); its composers union also dedupes writer/lyricist overlap.
async function fetchRichUserSongs(): Promise<RichUserSong[]> {
  const { data, error } = await supabase.rpc('my_repertoire');
  if (error) throw error;

  return ((data ?? []) as any[]).map(row => ({
    song_id: row.song_id,
    slug: row.slug ?? null,
    confidence: row.confidence ?? 'learn',
    key_note: row.key_note ?? null,
    updated_at: row.updated_at,
    title: row.title ?? '',
    display_artist: row.display_artist ?? null,
    byline: row.byline ?? null,
    card_identity: row.card_identity ?? null,
    recording_artists: row.recording_artists ?? [],
    composers: row.composers ?? [],
    cultures: row.cultures ?? [],
    genres: row.genres ?? [],
    languages: row.languages ?? [],
    themes: row.themes ?? [],
    forms: row.forms ?? [],
    occasions: row.occasions ?? [],
    communities: row.communities ?? [],
    productions: row.productions ?? [],
    vibe: row.vibe ?? null,
    tonality: row.tonality ?? null,
    meter: row.meter ?? null,
    year: row.year ?? null,
    popularity: Number(row.popularity ?? 0),
    chord_chart_url: row.chord_chart_url ?? null,
  }));
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function RepertoireScreen() {
  const router = useRouter();
  const [songs, setSongs] = useState<RichUserSong[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [singingVoice, setSingingVoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<ConfidenceFilter>('all');
  const [keyPickerSongId, setKeyPickerSongId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOrder>('title_asc');
  const [extFilters, setExtFilters] = useState<SongFilterState>(emptyFilterDimensions());
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [searchResults, setSearchResults] = useState<Suggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [addToSetSongs, setAddToSetSongs] = useState<{ id: string; title: string }[] | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestionsOffset, setSuggestionsOffset] = useState(0);
  const [suggestionsHasMore, setSuggestionsHasMore] = useState(true);
  const [suggestionsLoadingMore, setSuggestionsLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);


  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    try {
      const [data, profileRes, suggestionsRes] = await Promise.all([
        fetchRichUserSongs(),
        supabase.from('profiles').select('singing_voice').eq('id', user.id).single(),
        supabase.rpc('suggest_songs_for_user', { p_user_id: user.id, p_limit: 20 }),
      ]);
      setSongs(data);
      setSingingVoice(profileRes.data?.singing_voice ?? null);
      const initialSuggestions = (suggestionsRes.data ?? []) as Suggestion[];
      setSuggestions(initialSuggestions);
      setSuggestionsOffset(initialSuggestions.length);
      setSuggestionsHasMore(initialSuggestions.length === 20);
      writeCache('/repertoire', user.id, data);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    // Show the cached repertoire immediately; load() still runs and silently
    // replaces it (mirrors web repertoire/page.tsx's sessionStorage hydrate)
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id ?? null;
      if (uid) {
        const cached = await readCache<RichUserSong[]>('/repertoire', uid);
        if (cached) {
          setUserId(uid);
          setSongs(cached);
          setLoading(false);
        }
      }
      load();
    })();
  }, []);

  // Derive each filter dimension's options from songs passing the OTHER active
  // filters, so choosing one facet narrows the rest (cascading, like web).
  const hierarchy = useTagHierarchy();
  // A selected tag also covers everything below it (Rock covers Classic Rock).
  const expandedFilters = useMemo(() => expandFilterState(extFilters, hierarchy), [extFilters, hierarchy]);
  const options = useMemo(() => deriveFilterOptions(songs, expandedFilters), [songs, expandedFilters]);
  const facets = useMemo(() => deriveFilterFacets(songs, extFilters, hierarchy), [songs, extFilters, hierarchy]);

  const yearBounds = useMemo(() => {
    const years = songs.map(s => s.year).filter((y): y is number => y != null);
    return years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null };
  }, [songs]);

  // Typing searches the whole catalogue, matching web: results include songs you
  // already own (rendered with their role controls) as well as ones you don't.
  const searching = query.trim().length > 0;

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    setSubmitOpen(false);
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc('search_songs', { q, limit_n: 50 });
      setSearchResults((data ?? []) as Suggestion[]);
      setSearchLoading(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  const filtered = useMemo(() => {
    let result: RichUserSong[] = songs;

    if (confidenceFilter !== 'all') {
      result = result.filter(s => s.confidence === confidenceFilter);
    }

    result = result.filter(s => songMatchesFilters(s, expandedFilters));

    if (sortBy === 'title_desc') return [...result].sort((a, b) => b.title.localeCompare(a.title));
    if (sortBy === 'popularity') return [...result].sort((a, b) => b.popularity - a.popularity || a.title.localeCompare(b.title));
    return result;
  }, [songs, confidenceFilter, expandedFilters, sortBy]);

  const existingIds = useMemo(() => new Set(songs.map(s => s.song_id)), [songs]);
  const songsById = useMemo(() => new Map(songs.map(s => [s.song_id, s])), [songs]);

  // Songs already in the repertoire sort to the top, as on web.
  const sortedSearchResults = useMemo(
    () => sortRepertoireSearchResults(searchResults, existingIds),
    [searchResults, existingIds]
  );
  const extFilterCount = countActiveFilters(extFilters);
  const allSelected = useMemo(
    () => filtered.length > 0 && filtered.every(s => selectedIds.has(s.song_id)),
    [filtered, selectedIds]
  );

  // Latest-value refs so the row callbacks below can stay referentially stable.
  // Without them every edit rebuilds the callbacks, which re-renders every
  // visible row rather than only the song that actually changed.
  const latest = useRef({ songs, suggestions, load });
  latest.current = { songs, suggestions, load };

  const handleConfidenceChange = useCallback(async (song: { song_id: string }, confidence: string) => {
    if (!(await ensureLeadVoice(confidence, singingVoice, userId, setSingingVoice))) return;
    const songId = song.song_id;
    setSongs(prev => prev.map(s => s.song_id === songId ? { ...s, confidence } : s));
    const { error } = await supabase.from('user_songs').update({ confidence }).eq('user_id', userId).eq('song_id', songId);
    if (error) { Alert.alert('Error', error.message); latest.current.load(); }
  }, [userId, singingVoice]);

  const handleKeyChange = useCallback(async (songId: string, key_note: string | null) => {
    setSongs(prev => prev.map(s => s.song_id === songId ? { ...s, key_note } : s));
    const { error } = await supabase.from('user_songs').update({ key_note }).eq('user_id', userId).eq('song_id', songId);
    if (error) { Alert.alert('Error', error.message); latest.current.load(); }
  }, [userId]);

  const handleKeyTap = useCallback((song: { song_id: string }) => setKeyPickerSongId(song.song_id), []);

  const loadMoreSuggestions = useCallback(async () => {
    if (!suggestionsHasMore || loadingMoreRef.current || !userId) return;
    loadingMoreRef.current = true;
    setSuggestionsLoadingMore(true);
    const { data } = await supabase.rpc('suggest_songs_for_user', {
      p_user_id: userId,
      p_limit: 20,
      p_offset: suggestionsOffset,
    });
    if (data) {
      const page = data as Suggestion[];
      setSuggestions(prev => mergeSuggestionsById(prev, page));
      setSuggestionsOffset(prev => prev + page.length);
      setSuggestionsHasMore(page.length === 20);
    }
    loadingMoreRef.current = false;
    setSuggestionsLoadingMore(false);
  }, [suggestionsHasMore, userId, suggestionsOffset]);

  // Mirrors web's addSong from the suggestions panel: optimistically drop the
  // suggestion and insert it into the repertoire, reverting both on error.
  const addFromSuggestion = useCallback(async (s: Suggestion, confidence: string) => {
    if (!userId) return;
    if (!(await ensureLeadVoice(confidence, singingVoice, userId, setSingingVoice))) return;
    const prevSongs = latest.current.songs;
    const prevSuggestions = latest.current.suggestions;
    setSuggestions(prev => prev.filter(x => x.song_id !== s.song_id));
    setSongs(prev => {
      if (prev.find(x => x.song_id === s.song_id)) {
        return prev.map(x => x.song_id === s.song_id ? { ...x, confidence } : x);
      }
      const newSong: RichUserSong = {
        song_id: s.song_id,
        slug: s.slug,
        confidence,
        key_note: null,
        updated_at: new Date().toISOString(),
        title: s.title,
        display_artist: s.display_artist,
        byline: s.byline ?? null,
        card_identity: s.card_identity ?? null,
        recording_artists: s.recording_artists ?? [],
        composers: s.composers,
        cultures: s.cultures,
        genres: s.genres,
        languages: s.languages,
        themes: [],
        forms: [],
        occasions: [],
        communities: s.communities ?? [],
        productions: s.productions,
        vibe: null,
        tonality: null,
        meter: null,
        year: s.year,
        popularity: s.popularity,
      };
      return [...prev, newSong];
    });
    const { error } = await supabase.from('user_songs').upsert(
      { user_id: userId, song_id: s.song_id, confidence, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,song_id' }
    );
    if (error) {
      Alert.alert('Error', error.message);
      setSongs(prevSongs);
      setSuggestions(prevSuggestions);
    }
  }, [userId, singingVoice]);

  const toggleSelect = useCallback((song: { song_id: string }) => {
    setSelectedIds(prev => toggleSet(prev, song.song_id));
  }, []);

  const viewSong = useCallback((song: { song_id: string }) => {
    router.push(`/song/${song.song_id}` as any);
  }, [router]);

  const addOneToSet = useCallback((song: { song_id: string; title: string }) => {
    setAddToSetSongs([{ id: song.song_id, title: song.title }]);
  }, []);

  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filtered.map(s => s.song_id)));
  }

  // ── Bulk actions (bar mirrors web's amber bulk bar) ──────────────────────────

  function handleBulkAddToSet() {
    const selected = songs.filter(s => selectedIds.has(s.song_id)).map(s => ({ id: s.song_id, title: s.title }));
    setAddToSetSongs(selected);
  }

  function handleBulkConfidence(event: GestureResponderEvent) {
    const ids = Array.from(selectedIds);
    async function apply(confidence: string) {
      if (!(await ensureLeadVoice(confidence, singingVoice, userId, setSingingVoice))) return;
      setSongs(prev => prev.map(s => selectedIds.has(s.song_id) ? { ...s, confidence } : s));
      setSelectedIds(new Set());
      for (const songId of ids) {
        await supabase.from('user_songs').update({ confidence }).eq('user_id', userId).eq('song_id', songId);
      }
    }
    showOptionsSheet({
      title: `Change role for ${ids.length} ${ids.length === 1 ? 'song' : 'songs'}`,
      anchor: anchorFrom(event),
      options: CONFIDENCE_LEVELS.map(l => ({ label: l.label, onPress: () => { apply(l.key); } })),
    });
  }

  function handleBulkRemove() {
    const ids = Array.from(selectedIds);
    Alert.alert(
      'Remove songs',
      `Remove ${ids.length} ${ids.length === 1 ? 'song' : 'songs'} from your repertoire?`,
      [
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSongs(prev => prev.filter(s => !selectedIds.has(s.song_id)));
            setSelectedIds(new Set());
            for (const songId of ids) {
              await supabase.from('user_songs').delete().eq('user_id', userId).eq('song_id', songId);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  const renderItem = useCallback(
    ({ item, index }: { item: RichUserSong; index: number }) => (
      <RepertoireCard
        song={item}
        selected={selectedIds.has(item.song_id)}
        isLast={index === filtered.length - 1}
        onToggleSelect={toggleSelect}
        onConfidenceChange={handleConfidenceChange}
        onKeyTap={handleKeyTap}
        onAddToSet={addOneToSet}
        onView={viewSong}
      />
    ),
    [selectedIds, filtered.length, toggleSelect, handleConfidenceChange, handleKeyTap, addOneToSet, viewSong]
  );

  // Search results reuse the same two cards web does: owned songs keep their role
  // controls, everything else gets the add-with-role control.
  const renderSearchItem = useCallback(
    ({ item, index }: { item: Suggestion; index: number }) => {
      const owned = songsById.get(item.song_id);
      if (owned) {
        return (
          <RepertoireCard
            song={owned}
            selected={selectedIds.has(owned.song_id)}
              isLast={index === sortedSearchResults.length - 1}
            onToggleSelect={toggleSelect}
            onConfidenceChange={handleConfidenceChange}
            onKeyTap={handleKeyTap}
            onAddToSet={addOneToSet}
            onView={viewSong}
          />
        );
      }
      return (
        <SuggestionCard
          song={item}
          onAdd={addFromSuggestion}
          onView={viewSong}
        />
      );
    },
    [songsById, selectedIds, sortedSearchResults.length, toggleSelect,
     handleConfidenceChange, handleKeyTap, addOneToSet, viewSong, addFromSuggestion]
  );


  const listHeader = (
    <View>
      {/* Search card — mirrors web's bordered search panel */}
      <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <View className="flex-row items-center bg-white border border-zinc-200 rounded-xl px-3 py-2">
          <Ionicons name="search" size={16} color="#a1a1aa" />
          <TextInput
            className="flex-1 text-zinc-900 ml-2"
            placeholder="Search by title, songwriter, or artist…"
            placeholderTextColor="#a1a1aa"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')}>
              <Text className="text-zinc-400 ml-2">✕</Text>
            </TouchableOpacity>
          )}
        </View>
        {!searching && (
          <View className="mt-3 flex-row">
            <InlineDropdown
              value={confidenceFilter}
              options={[{ key: 'all' as const, label: 'Any role' }, ...CONFIDENCE_LEVELS]}
              onChange={setConfidenceFilter}
              accessibilityLabel="Filter by role"
            />
          </View>
        )}
      </View>

      {/* Search mode replaces the toolbar with a result count, as on web */}
      {searching ? (
        <Text className="mx-4 mt-4 px-1 text-sm text-zinc-500">
          {searchLoading
            ? 'Searching…'
            : `${sortedSearchResults.length} result${sortedSearchResults.length === 1 ? '' : 's'}`}
        </Text>
      ) : (
      <>
      {/* Count / sort / filters toolbar */}
      <View className="mx-4 mt-4 flex-row items-center justify-between">
        <Text className="text-xs font-medium text-zinc-400 uppercase tracking-wide px-1">
          {filtered.length} of {songs.length}
        </Text>
        <View className="flex-row items-center gap-2">
          <InlineDropdown
            value={sortBy}
            options={SORT_OPTIONS}
            onChange={setSortBy}
            accessibilityLabel="Sort"
          />
          <FiltersButton count={extFilterCount} onPress={() => setFilterModalVisible(true)} />
        </View>
      </View>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <View className="mx-4 mt-3 flex-row flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <Text className="text-sm font-medium text-amber-800">{selectedIds.size} selected</Text>
          <TouchableOpacity onPress={() => setSelectedIds(new Set())}>
            <Text className="text-xs text-amber-700 underline">Deselect all</Text>
          </TouchableOpacity>
          <View className="flex-row items-center gap-2 ml-auto">
            <TouchableOpacity onPress={handleBulkAddToSet} className="rounded-full border border-zinc-300 bg-white px-2 py-1.5">
              <Text className="text-xs text-zinc-700">Add to set…</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBulkConfidence} className="rounded-full border border-zinc-300 bg-white px-2 py-1.5">
              <Text className="text-xs text-zinc-700">Change role…</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleBulkRemove} className="rounded-full border border-zinc-200 bg-white px-3 py-1.5">
              <Text className="text-xs text-zinc-500">Remove</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Select all — top row of the list container */}
      {filtered.length > 0 && (
        <View className="mx-4 mt-4 flex-row items-center gap-3 rounded-t-md border border-zinc-200 bg-zinc-50 px-4 py-2">
          <TouchableOpacity onPress={toggleSelectAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name={allSelected ? 'checkbox' : 'square-outline'}
              size={18}
              color={allSelected ? '#d97706' : '#d4d4d8'}
            />
          </TouchableOpacity>
          <Text className="text-xs text-zinc-400">Select all</Text>
        </View>
      )}
      </>
      )}
    </View>
  );

  // "Songs you might know" — mirrors web's SuggestionsPanel, shown below the
  // list (and below the empty-state card) but hidden while searching.
  const showSuggestions = !searching && suggestions.length > 0;
  // Memoised because, unlike the Song Library's, this footer carries up to 20
  // SuggestionCards outside the virtualised list — rebuilding that tree on
  // every sort or filter change is the main reason Repertoire felt heavier
  // than Search for the same interaction.
  const listFooter = useMemo(() => searching ? (
    searchLoading ? null : (
      <View className="mx-4 mt-4">
        {/* Collapsed behind a button like web's SubmitSongForm — the expanded
            form is a lot of vertical space for a rare action. */}
        {submitOpen ? (
          <SubmitMissingSong
            defaultTitle={query.trim()}
            onCreated={(songId) => router.push(`/song/${songId}` as any)}
          />
        ) : (
          <View className="items-center rounded-2xl border border-dashed border-zinc-300 px-4 py-5">
            <Text className="text-sm text-zinc-500">Can't find your song?</Text>
            <TouchableOpacity
              onPress={() => setSubmitOpen(true)}
              className="mt-3 rounded-full bg-zinc-800 px-4 py-2.5"
            >
              <Text className="text-sm font-semibold text-white">Add a missing song</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  ) : showSuggestions ? (
    <View>
      <Text className="mx-4 px-1 mt-6 mb-2 text-sm font-medium text-zinc-500">
        Songs you might know
      </Text>
      {suggestions.map(s => (
        <SuggestionCard
          key={s.song_id}
          song={s}
          onAdd={addFromSuggestion}
          onView={viewSong}
        />
      ))}
      {suggestionsLoadingMore && (
        <View className="py-3">
          <ActivityIndicator size="small" color="#d97706" />
        </View>
      )}
    </View>
  ) : null, [
    searching, searchLoading, submitOpen, query, router,
    showSuggestions, suggestions, addFromSuggestion, viewSong,
    suggestionsLoadingMore,
  ]);

  const { session, initialised } = useAuth();
  // Signed-out: web keeps the page heading and pitches the feature rather than
  // showing a bare lock wall (web repertoire/page.tsx).
  if (initialised && !session) {
    return (
      <View className="flex-1 bg-slate-50">
        <BrandHeader />
        <ContentContainer>
          <View className="px-4 pt-4 pb-3 bg-white border-b border-zinc-100">
            <Text className="text-2xl font-bold text-zinc-900">My Repertoire</Text>
            <Text className="text-zinc-500 text-sm mt-0.5">Every song you know or want to learn.</Text>
          </View>
          <View className="mt-4">
            <PromptCard
              variant="guest"
              title="Track the songs you know"
              body="Add songs to your repertoire — as a lead, support, or something you're learning — and SingJam will match you with musicians who share your songs."
              actionLabel="Sign in →"
              onAction={() => router.push('/(auth)/sign-in' as any)}
            />
          </View>
        </ContentContainer>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-50">
      <SongFilterSheet
        visible={filterModalVisible}
        filters={extFilters}
        options={options}
        facets={facets}
        hierarchy={hierarchy}
        yearBounds={yearBounds}
        emptyHint={{
          title: 'No filter options available yet.',
          detail: 'Add more songs to your repertoire.',
        }}
        onChange={setExtFilters}
        onClose={() => setFilterModalVisible(false)}
      />

      <BrandHeader />

      <ContentContainer>
      {/* Header */}
      <View className="px-4 pt-4 pb-3 bg-white border-b border-zinc-100">
        <Text className="text-2xl font-bold text-zinc-900">My Repertoire</Text>
        {!loading && (
          <Text className="text-zinc-400 text-sm mt-0.5">
            {songs.length} {songs.length === 1 ? 'song' : 'songs'}
          </Text>
        )}
      </View>

      {loading ? (
        <View className="pt-4">
          <View className="mx-4 h-24 rounded-2xl border border-zinc-200 bg-white mb-4" />
          {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <FlatList
          data={(searching ? sortedSearchResults : filtered) as any[]}
          keyExtractor={item => item.song_id}
          renderItem={(searching ? renderSearchItem : renderItem) as any}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          onEndReached={showSuggestions ? loadMoreSuggestions : undefined}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#d97706" />}
          ListEmptyComponent={
            // While searching, the result count and the "add a missing song" panel
            // already cover the no-results case, as they do on web.
            searching ? null : (
              <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-6 items-center">
                {confidenceFilter !== 'all' || extFilterCount > 0 ? (
                  <>
                    <Text className="text-sm text-zinc-500">No songs match these filters.</Text>
                    {extFilterCount > 0 && (
                      <TouchableOpacity onPress={() => setExtFilters(emptyFilterDimensions())} className="mt-3">
                        <Text className="text-amber-600 font-medium text-sm">Clear filters</Text>
                      </TouchableOpacity>
                    )}
                  </>
                ) : (
                  <>
                    <Text className="text-base font-semibold text-zinc-900">Your repertoire is empty</Text>
                    <Text className="mt-1 text-sm text-zinc-500 text-center">
                      Add songs you know and SingJam will match you with musicians who share your repertoire.
                    </Text>
                    <Text className="mt-3 text-sm text-zinc-400 text-center">
                      Search for a song above, or pick one from the suggestions below.
                    </Text>
                  </>
                )}
              </View>
            )
          }
          contentContainerStyle={{ paddingBottom: 32 }}
        />
      )}
      </ContentContainer>

      <KeyPicker
        visible={!!keyPickerSongId}
        title="My key"
        current={songs.find(s => s.song_id === keyPickerSongId)?.key_note ?? null}
        onClose={() => setKeyPickerSongId(null)}
        onSelect={(key) => { if (keyPickerSongId) handleKeyChange(keyPickerSongId, key); }}
      />

      {addToSetSongs && (
        <AddToSetModal
          visible={!!addToSetSongs}
          songs={addToSetSongs}
          onClose={() => { setAddToSetSongs(null); setSelectedIds(new Set()); }}
        />
      )}
    </View>
  );
}
