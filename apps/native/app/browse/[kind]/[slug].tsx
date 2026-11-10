import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  browsePath, KIND_LABEL, loadBrowseEntity, loadBrowseRelated, loadBrowseSongs, traditionalCultureChips,
  songMatchesFilters, type BrowseEntity, type BrowseKind, type BrowseRelatedGroup, type BrowseSongRow, type LinkedTag, type SongFilterState,
} from '@singjam/core';
import SongFilterSheet, { emptyFilterDimensions } from '@/components/SongFilterSheet';
import SuggestionCard, { type Suggestion } from '@/components/SuggestionCard';
import { useMySongs } from '@/lib/useMySongs';
import { useFilterFacets } from '@/lib/useFilterFacets';
import InlineDropdown from '@/components/InlineDropdown';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { browseKindFromSegment, nativeBrowseHref } from '@/lib/browseLinks';
import FiltersButton from '@/components/FiltersButton';
import CreditText from '@/components/CreditText';
import { useMySongTools } from '@/lib/useMySongTools';

type SortBy = 'popularity' | 'title_asc' | 'title_desc';
const SORT_OPTIONS: { key: SortBy; label: string }[] = [
  { key: 'popularity', label: 'Most known' },
  { key: 'title_asc', label: 'A–Z' },
  { key: 'title_desc', label: 'Z–A' },
];

function TagLinks({ label, tags, onPress }: { label: string; tags: LinkedTag[]; onPress: (t: LinkedTag) => void }) {
  if (tags.length === 0) return null;
  return (
    <View className="flex-row flex-wrap items-center mb-1">
      <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mr-2 mb-2">{label}</Text>
      {tags.map(t => (
        <TouchableOpacity key={`${t.type}:${t.slug}`} onPress={() => onPress(t)} className="px-2.5 py-1 rounded-full border border-slate-200 bg-white mr-1.5 mb-2">
          <Text className="text-xs text-slate-700">{t.name}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Native counterpart of web's browse pages (/genres/rock, /people/john-newton, …).
export default function BrowseRoute() {
  const { kind: segment, slug, traditional } = useLocalSearchParams<{ kind: string; slug: string; traditional?: string }>();
  return <BrowseScreen kind={browseKindFromSegment(segment ?? '')} slug={slug} traditional={traditional === '1'} />;
}

// One browse page; scripture passages reach it from their own route (browse/scripture/[...ref]).
export function BrowseScreen({ kind, slug, traditional = false }: { kind: BrowseKind | null; slug: string | undefined; traditional?: boolean }) {
  const router = useRouter();
  const [entity, setEntity] = useState<BrowseEntity | null | undefined>(undefined);
  const [songs, setSongs] = useState<BrowseSongRow[]>([]);
  const [members, setMembers] = useState(0);
  const [related, setRelated] = useState<BrowseRelatedGroup[]>([]);
  const [filters, setFilters] = useState<SongFilterState>(emptyFilterDimensions());
  const [sortBy, setSortBy] = useState<SortBy>('popularity');
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    if (!kind || !slug) { setEntity(null); return; }
    let live = true;
    (async () => {
      const e = await loadBrowseEntity(supabase, kind, slug, { traditional }).catch(() => null);
      if (!live) return;
      setEntity(e);
      if (e) {
        const [r, rel] = await Promise.all([
          loadBrowseSongs(supabase, e.songIds).catch(() => ({ songs: [] as BrowseSongRow[], members: 0 })),
          loadBrowseRelated(supabase, e.songIds, { kind: kind!, slug: slug! }).catch(() => [] as BrowseRelatedGroup[]),
        ]);
        if (live) { setSongs(r.songs); setMembers(r.members); setRelated(rel); }
      }
    })();
    return () => { live = false; };
  }, [kind, slug, traditional]);

  const openTag = useCallback((t: LinkedTag) => router.push(nativeBrowseHref(browsePath(t.type, t.slug)) as any), [router]);
  const openBrowse = useCallback((webPath: string) => router.push(nativeBrowseHref(webPath) as any), [router]);
  const viewSong = useCallback((song: { song_id: string }) => router.push(`/song/${song.song_id}` as any), [router]);
  const { myConfidence, addSong } = useMySongs();
  const { tools, modals: mySongModals } = useMySongTools();
  // The Song Library's filters, scoped to this page's songs (each row carries its own filter fields).
  const { hierarchy, expanded, options, facets, yearBounds, activeCount } = useFilterFacets(songs, filters);
  // Card props built once per load, so memoised cards keep the same song object.
  const cards = useMemo(() => songs.map(s => ({ row: s, song: { ...s, first_line: null, year: null, recording_artists: s.recording_artists ?? null } as Suggestion })), [songs]);
  const shownCards = useMemo(() => {
    const list = activeCount === 0 ? cards : cards.filter(c => songMatchesFilters(c.row, expanded));
    if (sortBy === 'title_asc') return [...list].sort((a, b) => a.row.title.localeCompare(b.row.title));
    if (sortBy === 'title_desc') return [...list].sort((a, b) => b.row.title.localeCompare(a.row.title));
    return list;
  }, [cards, activeCount, expanded, sortBy]);
  const roles = entity?.roles;
  const renderItem = useCallback(({ item }: { item: { song: Suggestion } }) => (
    <SuggestionCard
      song={item.song}
      confidence={myConfidence.get(item.song.song_id) ?? null}
      context={roles?.get(item.song.song_id) ?? null}
      onAdd={addSong}
      onView={viewSong}
      onOpenBrowse={openBrowse}
      tools={tools}
    />
  ), [myConfidence, roles, addSong, viewSong, openBrowse, tools]);

  if (entity === undefined) {
    return (<><Stack.Screen options={{ title: '', headerTintColor: '#d97706' }} /><ActivityIndicator className="mt-16" color="#d97706" /></>);
  }
  if (!entity || !kind) {
    return (
      <>
        <Stack.Screen options={{ title: 'Not found', headerTintColor: '#d97706' }} />
        <Text className="text-sm text-slate-500 mt-16 text-center">This page doesn’t exist.</Text>
      </>
    );
  }
  const total = entity.songIds.length;
  const byCulture = kind === 'person' && entity.slug === 'traditional' ? traditionalCultureChips(songs) : [];
  const header = (
    <View className="px-4 pt-4">
      <TouchableOpacity onPress={() => router.push('/browse' as any)}>
        <Text className="text-xs font-medium text-amber-700 uppercase tracking-wide">{entity.label ?? KIND_LABEL[kind]}</Text>
      </TouchableOpacity>
      <Text className="text-2xl font-semibold text-slate-900 mt-1">{entity.name}</Text>
      {entity.subtitle ? <Text className="text-base text-slate-500">{entity.subtitle}</Text> : null}
      {entity.facts && entity.facts.length > 0 ? (
        <View className="mt-1">
          {entity.facts.map(line => (
            <Text key={line.label} className="text-sm text-slate-600 mb-0.5">
              <Text className="font-medium">{line.label}: </Text>
              {line.groups.map((g, i) => (
                <Text key={i}>{i > 0 ? ' · ' : ''}<CreditText credits={g} onOpen={openBrowse} linkClassName="text-amber-700" /></Text>
              ))}
            </Text>
          ))}
        </View>
      ) : null}
      <Text className="text-sm text-slate-500 mt-1">
        {entity.traditionalOnly ? `${total} traditional song${total === 1 ? '' : 's'} · ` : `${total} song${total === 1 ? '' : 's'}`}
        {entity.traditionalOnly ? (
          <Text>
            <Text className="font-medium text-amber-700" onPress={() => router.replace(nativeBrowseHref(browsePath(kind!, entity.slug ?? slug!)) as any)}>Show all {entity.allSongCount}</Text>
            {' · '}
            <Text className="font-medium text-amber-700" onPress={() => router.push(nativeBrowseHref(browsePath('person', 'traditional')) as any)}>All traditional songs</Text>
          </Text>
        ) : null}
        {members > 0 ? ` · ${members} member${members === 1 ? '' : 's'} know${members === 1 ? 's' : ''} at least one` : ''}
      </Text>
      {entity.notes ? <Text className="text-sm text-slate-600 mt-3">{entity.notes}</Text> : null}
      {entity.readUrl ? (
        <Text className="text-sm font-medium text-amber-700 mt-3" onPress={() => Linking.openURL(entity.readUrl!.href)}>
          Read {entity.name} on {entity.readUrl.site} ↗
        </Text>
      ) : null}

      {byCulture.length > 0 && (
        <View className="mt-4">
          <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">By culture</Text>
          <View className="flex-row flex-wrap">
            {byCulture.map(c => (
              <TouchableOpacity key={c.href} onPress={() => openBrowse(c.href)} className="px-3 py-1.5 rounded-full border border-slate-200 bg-white mr-2 mb-2">
                <Text className="text-sm text-slate-700">{c.label}<Text className="text-slate-400">{`  ${c.count}`}</Text></Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {(entity.parents.length > 0 || entity.children.length > 0 || entity.related.length > 0) && (
        <View className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <TagLinks label="Part of" tags={entity.parents} onPress={openTag} />
          <TagLinks label={kind === 'scripture' ? 'Chapters' : 'Includes'} tags={entity.children} onPress={openTag} />
          <TagLinks label="Related" tags={entity.related.filter(t => t.type === kind)} onPress={openTag} />
          <TagLinks label="See also" tags={entity.related.filter(t => t.type !== kind)} onPress={openTag} />
        </View>
      )}

      <View className="flex-row items-center mt-4" style={{ gap: 8 }}>
        {songs.length > 1 && (
          <InlineDropdown value={sortBy} options={SORT_OPTIONS} onChange={setSortBy} accessibilityLabel="Sort" />
        )}
        {songs.length > 1 && <FiltersButton count={activeCount} onPress={() => setSheetOpen(true)} />}
        {activeCount > 0 ? <Text className="text-xs text-zinc-500">{shownCards.length} of {songs.length}</Text> : null}
      </View>
      <View className="h-2" />
    </View>
  );
  const footer = related.length > 0 ? (
    <View className="px-4 pb-12">
      <View className="mt-6">
        <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Explore from here</Text>
        {related.map(g => (
          <View key={g.key} className="mb-2">
            <Text className="text-xs text-slate-500 mb-1">{g.title}</Text>
            <View className="flex-row flex-wrap">
              {g.chips.map(c => (
                <TouchableOpacity key={c.href} onPress={() => router.push(nativeBrowseHref(c.href) as any)} className="px-2.5 py-1 rounded-full border border-slate-200 bg-white mr-1.5 mb-1.5">
                  <Text className="text-xs text-slate-700">{c.label}<Text className="text-slate-400">{`  ${c.count}`}</Text></Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  ) : <View className="h-12" />;

  return (
    <>
      <Stack.Screen options={{ title: entity.name, headerTintColor: '#d97706' }} />
      <View className="flex-1 bg-slate-50">
      <ContentContainer>
      <FlatList
        data={shownCards}
        keyExtractor={c => c.song.song_id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          <Text className="text-sm text-zinc-500 text-center py-8">{songs.length === 0 ? 'No songs here yet.' : 'No songs here match these filters.'}</Text>
        }
      />
      </ContentContainer>
      </View>
      <SongFilterSheet
        visible={sheetOpen}
        filters={filters}
        options={options}
        facets={facets}
        hierarchy={hierarchy}
        yearBounds={yearBounds}
        onChange={setFilters}
        onClose={() => setSheetOpen(false)}
      />
      {mySongModals}
    </>
  );
}
