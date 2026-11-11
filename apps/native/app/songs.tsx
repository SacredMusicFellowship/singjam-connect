import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { songMatchesFilters, type CardIdentity, type SongFilterState, type ProductionCredit, type RecordingArtistCredit } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/cache';
import ContentContainer from '@/components/ContentContainer';
import SubmitMissingSong from '@/components/SubmitMissingSong';
import { useMySongTools } from '@/lib/useMySongTools';
import { useMySongs } from '@/lib/useMySongs';
import { useFilterFacets } from '@/lib/useFilterFacets';
import SuggestionCard from '@/components/SuggestionCard';
import SongFilterSheet, { emptyFilterDimensions } from '@/components/SongFilterSheet';
import { nativeBrowseHref } from '@/lib/browseLinks';
import InlineDropdown from '@/components/InlineDropdown';
import FiltersButton from '@/components/FiltersButton';
import HideMySongsToggle from '@/components/HideMySongsToggle';

// A superset of SuggestionCard's `Suggestion`, so catalog rows render in the
// same card web uses while still carrying the fields the filters need.
type SongMeta = {
  song_id: string;
  title: string;
  display_artist: string | null;
  byline: string | null;
  card_identity?: CardIdentity;
  first_line: string | null;
  slug: string | null;
  composers: string[];
  productions: string[];
  popularity: number;
  genres: string[];
  cultures: string[];
  languages: string[];
  themes: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
  youtube_id: string | null;
  spotify_track_id: string | null;
  recording_artists?: RecordingArtistCredit[] | null;
  production_credits?: ProductionCredit[] | null;
};

type SortBy = 'popularity' | 'title_asc' | 'title_desc';

const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'popularity', label: 'Popular' },
  { key: 'title_asc', label: 'A–Z' },
  { key: 'title_desc', label: 'Z–A' },
];

function SkeletonCard() {
  return (
    <View className="mx-4 mb-2 rounded-2xl border border-zinc-200 bg-white p-4">
      <View className="h-4 bg-zinc-200 rounded w-2/3 mb-2" />
      <View className="h-3 bg-zinc-100 rounded w-1/2 mb-3" />
      <View className="flex-row" style={{ gap: 6 }}>
        <View className="h-8 w-36 bg-zinc-100 rounded-xl" />
        <View className="h-8 w-16 bg-zinc-100 rounded-xl" />
      </View>
    </View>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────

type Filters = SongFilterState & { sortBy: SortBy };

function emptyFilters(): Filters {
  return { sortBy: 'popularity', ...emptyFilterDimensions() };
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function applySort(songs: SongMeta[], sortBy: SortBy): SongMeta[] {
  if (sortBy === 'title_asc') return [...songs].sort((a, b) => a.title.localeCompare(b.title));
  if (sortBy === 'title_desc') return [...songs].sort((a, b) => b.title.localeCompare(a.title));
  return [...songs].sort((a, b) => b.popularity - a.popularity || a.title.localeCompare(b.title));
}

// browse_songs and search_songs return the same column names, so one mapper
// serves both. Notably they derive youtube_id / spotify_track_id from the media
// URLs in SQL — a raw `songs` select cannot produce them.
function toSongMeta(r: any): SongMeta {
  return {
    song_id: r.song_id,
    title: r.title ?? '',
    display_artist: r.display_artist ?? null,
    byline: r.byline ?? null,
    card_identity: r.card_identity ?? null,
    first_line: r.first_line ?? null,
    slug: r.slug ?? null,
    youtube_id: r.youtube_id ?? null,
    spotify_track_id: r.spotify_track_id ?? null,
    recording_artists: r.recording_artists ?? null,
    production_credits: r.production_credits ?? null,
    composers: r.composers ?? [],
    productions: r.productions ?? [],
    popularity: Number(r.popularity ?? 0),
    genres: r.genres ?? [],
    cultures: r.cultures ?? [],
    languages: r.languages ?? [],
    themes: r.themes ?? [],
    forms: r.forms ?? [],
    occasions: r.occasions ?? [],
    communities: r.communities ?? [],
    vibe: r.vibe ?? null,
    tonality: r.tonality ?? null,
    meter: r.meter ?? null,
    year: r.year ?? null,
  };
}

const CATALOG_PAGE = 200; // browse_songs caps p_limit at 200 server-side

const CATALOG_CACHE_KEY = '/songs';
// Deliberately not user-scoped, unlike the other cache entries: the catalog is
// public data, identical for everyone, so one 501 KB entry serves every account
// on the device plus the signed-out guest view. Nothing personal is in it.
const CATALOG_CACHE_UID = null;

// The catalog comes from browse_songs — the same RPC web /search browses — so
// popularity and the media ids have a single source instead of being re-derived
// here. Not fetchAllRows: that walks pages sequentially, and at 200 rows a page
// six serial round-trips of full-catalog work measured ~3x slower than the old
// raw select. The first page reports total_count, so the rest are fanned out in
// parallel (~310-560ms for 1056 rows). browse_songs orders by `title asc, id asc`,
// so page boundaries are stable; errors throw rather than truncating the list,
// and the dedupe by song_id absorbs a concurrent insert shifting the offsets.
async function fetchCatalog(): Promise<SongMeta[]> {
  async function page(offset: number): Promise<any[]> {
    const { data, error } = await supabase.rpc('browse_songs', {
      p_sort: 'title_asc',
      p_offset: offset,
      p_limit: CATALOG_PAGE,
    });
    if (error) throw error;
    return (data ?? []) as any[];
  }

  const first = await page(0);
  const total = Number(first[0]?.total_count ?? first.length);

  const offsets: number[] = [];
  for (let o = CATALOG_PAGE; o < total; o += CATALOG_PAGE) offsets.push(o);
  const rest = await Promise.all(offsets.map(page));

  const byId = new Map<string, any>();
  for (const row of [first, ...rest].flat()) byId.set(row.song_id, row);
  return Array.from(byId.values(), toSongMeta);
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SongLibraryScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [allSongs, setAllSongs] = useState<SongMeta[]>([]);
  const [searchResults, setSearchResults] = useState<SongMeta[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [searchLoading, setSearchLoading] = useState(false);
  // Your songs come from the session's My-songs store. The list waits until
  // they're known, or songs already yours would briefly offer "I know this
  // song!" and a fast tap would overwrite your role.
  const { userId, loaded: ownershipKnown, myConfidence, addSong } = useMySongs();
  const loadingAll = catalogLoading || !ownershipKnown;
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [hideMySongs, setHideMySongs] = useState(false);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Show the cached catalog straight away, then revalidate — same
    // stale-while-revalidate pattern as Repertoire and Jams. Reaching this
    // screen is a nav push, so without this every visit waits on the full
    // catalog fetch again.
    async function init() {
      const cached = await readCache<SongMeta[]>(CATALOG_CACHE_KEY, CATALOG_CACHE_UID);
      if (cached?.length) {
        setAllSongs(cached);
        setCatalogLoading(false);
      }
      const songs = await fetchCatalog();
      setAllSongs(songs);
      setCatalogLoading(false);
      writeCache(CATALOG_CACHE_KEY, CATALOG_CACHE_UID, songs);
    }
    init().catch(() => setCatalogLoading(false));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (!q) { setSearchResults([]); setSearchLoading(false); return; }
    setSearchLoading(true);
    setSubmitOpen(false);
    timer.current = setTimeout(async () => {
      const { data } = await supabase.rpc('search_songs', { q, limit_n: 100 });
      setSearchResults(((data ?? []) as any[]).map(toSongMeta));
      setSearchLoading(false);
    }, 250);
  }, [query]);

  // Derive each filter dimension's options from songs passing the OTHER active
  // filters, so choosing one facet narrows the rest (cascading, like web).
  //
  // Deliberately depends on the individual dimensions rather than the whole
  // `filters` object: this screen keeps `sortBy` in there too, and re-sorting
  // cannot change which facets exist — depending on the object rebuilt all seven
  // option lists every time you changed the sort order. Likewise `myConfidence`
  // only reaches the pool while "Hide my songs" is on, so ordinary repertoire
  // edits shouldn't rebuild them either.
  const { genres, forms, occasions, communities, cultures, languages, themes, vibe, tonality, meter, yearMin, yearMax } = filters;
  const hiddenIds = hideMySongs ? myConfidence : null;
  const dims = useMemo(
    () => ({ genres, forms, occasions, communities, cultures, languages, themes, vibe, tonality, meter, yearMin, yearMax }),
    [genres, forms, occasions, communities, cultures, languages, themes, vibe, tonality, meter, yearMin, yearMax]
  );
  const pool = useMemo(() => (hiddenIds ? allSongs.filter(s => !hiddenIds.has(s.song_id)) : allSongs), [allSongs, hiddenIds]);
  const { hierarchy, expanded: expandedDims, options, facets, yearBounds, activeCount: activeFilterCount } = useFilterFacets(pool, dims);

  const displayedSongs = useMemo(() => {
    const base = query.trim() ? searchResults : allSongs;
    const filtered = base.filter(s =>
      (!hideMySongs || !myConfidence.has(s.song_id)) && songMatchesFilters(s, expandedDims)
    );
    return applySort(filtered, filters.sortBy);
  }, [query, allSongs, searchResults, filters, expandedDims, hideMySongs, myConfidence]);

  const viewSong = useCallback((song: { song_id: string }) => {
    router.push(`/song/${song.song_id}` as any);
  }, [router]);
  const openBrowse = useCallback((webPath: string) => router.push(nativeBrowseHref(webPath) as any), [router]);
  const { tools, modals: mySongModals } = useMySongTools();

  const renderItem = useCallback(({ item }: { item: SongMeta }) => (
    <SuggestionCard
      song={item}
      confidence={myConfidence.get(item.song_id) ?? null}
      onAdd={addSong}
      onView={viewSong}
      onOpenBrowse={openBrowse}
      tools={tools}
    />
  ), [myConfidence, addSong, viewSong, openBrowse, tools]);

  const searching = query.trim().length > 0;

  const listHeader = (
    <View>
      {/* Search card — mirrors web's bordered search panel */}
      <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <View className="flex-row items-center rounded-xl border border-zinc-200 px-3 py-2">
          <Ionicons name="search" size={16} color="#a1a1aa" />
          <TextInput
            className="flex-1 text-zinc-900 ml-2"
            placeholder="Search by title, first line, recording artist, or composer"
            placeholderTextColor="#a1a1aa"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={16} color="#a1a1aa" />
            </TouchableOpacity>
          )}
        </View>
        {searching && (
          <Text className="text-xs text-zinc-500 mt-2">
            {searchLoading ? 'Searching…' : `${displayedSongs.length} song${displayedSongs.length === 1 ? '' : 's'}`}
          </Text>
        )}
      </View>

      {/* Sort / filters / hide-my-songs, then the catalog total — web's order */}
      <View className="mx-4 mt-3 flex-row items-center px-1" style={{ gap: 8 }}>
        <InlineDropdown
          value={filters.sortBy}
          options={SORT_OPTIONS}
          onChange={(sortBy) => setFilters(f => ({ ...f, sortBy }))}
          accessibilityLabel="Sort"
        />
        <FiltersButton count={activeFilterCount} onPress={() => setFilterModalVisible(true)} />
        {userId && myConfidence.size > 0 && (
          <HideMySongsToggle checked={hideMySongs} onPress={() => setHideMySongs(v => !v)} />
        )}
      </View>
      {!searching && (
        <Text className="mx-4 mt-2 mb-2 px-1 text-xs font-medium text-zinc-400 uppercase tracking-wide">
          {displayedSongs.length} {displayedSongs.length === 1 ? 'song' : 'songs'}
        </Text>
      )}
      {searching && <View className="h-3" />}
    </View>
  );

  // Web keeps its submit-a-song form at the foot of the list; collapsed here
  // because the expanded form is a lot of vertical space for a rare action.
  const listFooter = searching && !searchLoading ? (
    <View className="mx-4 mt-2">
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
  ) : null;

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Song Library',
          headerTintColor: '#d97706',
          headerRight: () => (
            <TouchableOpacity onPress={() => router.push('/browse' as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text className="text-amber-600 font-medium">Browse</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <SongFilterSheet
        visible={filterModalVisible}
        filters={filters}
        options={options}
        facets={facets}
        hierarchy={hierarchy}
        yearBounds={yearBounds}
        onChange={setFilters}
        onClose={() => setFilterModalVisible(false)}
      />
      <ContentContainer style={{ backgroundColor: '#fafafa' }}>
      <KeyboardAvoidingView className="flex-1 bg-slate-50" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {loadingAll ? (
          <View className="pt-4">
            <View className="mx-4 h-20 rounded-2xl border border-zinc-200 bg-white mb-3" />
            {[...Array(5)].map((_, i) => <SkeletonCard key={i} />)}
          </View>
        ) : (
          <FlatList
            data={displayedSongs}
            keyExtractor={item => item.song_id}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={listHeader}
            ListFooterComponent={listFooter}
            contentContainerStyle={{ paddingBottom: 32 }}
            ListEmptyComponent={
              searchLoading ? null : (
                <View className="mx-4 rounded-2xl border border-zinc-200 bg-white p-5">
                  <Text className="text-sm text-zinc-600">
                    {!searching
                      ? 'No songs match the selected filters.'
                      : searchResults.length > 0
                        ? 'No results match the active filters.'
                        : 'No songs found.'}
                  </Text>
                  {activeFilterCount > 0 && (
                    <TouchableOpacity onPress={() => setFilters(emptyFilters())} className="mt-3">
                      <Text className="text-amber-600 font-medium text-sm">Clear filters</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            }
          />
        )}
      </KeyboardAvoidingView>
      </ContentContainer>
      {mySongModals}
    </>
  );
}
