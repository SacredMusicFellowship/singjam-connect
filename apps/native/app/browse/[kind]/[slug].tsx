import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  browsePath, countActiveFilters, deriveFilterFacets, deriveFilterOptions, expandFilterState, loadBrowseEntity, loadBrowseRelated, loadBrowseSongs,
  songMatchesFilters, type BrowseEntity, type BrowseKind, type BrowseRelatedGroup, type BrowseSongRow, type FilterableSong, type LinkedTag, type SongFilterState,
} from '@singjam/core';
import SongFilterSheet, { emptyFilterDimensions } from '@/components/SongFilterSheet';
import SuggestionCard from '@/components/SuggestionCard';
import { useMySongs } from '@/lib/useMySongs';
import { useTagHierarchy } from '@/lib/useTagHierarchy';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { browseKindFromSegment, nativeBrowseHref } from '@/lib/browseLinks';

const KIND_LABEL: Record<BrowseKind, string> = {
  genre: 'Genre', form: 'Form', occasion: 'Occasion', community: 'Community', culture: 'Culture',
  language: 'Language', theme: 'Theme', mode: 'Mode', rhythm: 'Rhythm', person: 'Songwriter', artist: 'Recording artist', show: 'Show', tune: 'Tune', text: 'Text',
};

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
export default function BrowseScreen() {
  const { kind: segment, slug } = useLocalSearchParams<{ kind: string; slug: string }>();
  const router = useRouter();
  const kind = browseKindFromSegment(segment ?? '');
  const [entity, setEntity] = useState<BrowseEntity | null | undefined>(undefined);
  const [songs, setSongs] = useState<BrowseSongRow[]>([]);
  const [members, setMembers] = useState(0);
  const [meta, setMeta] = useState<(FilterableSong & { song_id: string })[]>([]);
  const [related, setRelated] = useState<BrowseRelatedGroup[]>([]);
  const [filters, setFilters] = useState<SongFilterState>(emptyFilterDimensions());
  const [sheetOpen, setSheetOpen] = useState(false);
  const hierarchy = useTagHierarchy();

  useEffect(() => {
    if (!kind || !slug) { setEntity(null); return; }
    let live = true;
    (async () => {
      const e = await loadBrowseEntity(supabase, kind, slug).catch(() => null);
      if (!live) return;
      setEntity(e);
      if (e) {
        const ids = new Set(e.songIds);
        const [r, m, rel] = await Promise.all([
          loadBrowseSongs(supabase, e.songIds).catch(() => ({ songs: [] as BrowseSongRow[], members: 0 })),
          supabase.rpc('song_filter_meta').then(({ data }) => ((data ?? []) as (FilterableSong & { song_id: string })[]).filter(x => ids.has(x.song_id))),
          loadBrowseRelated(supabase, e.songIds, { kind: kind!, slug: slug! }).catch(() => [] as BrowseRelatedGroup[]),
        ]);
        if (live) { setSongs(r.songs); setMembers(r.members); setMeta(m); setRelated(rel); }
      }
    })();
    return () => { live = false; };
  }, [kind, slug]);

  const openTag = (t: LinkedTag) => router.push(nativeBrowseHref(browsePath(t.type, t.slug)) as any);
  const openBrowse = useCallback((webPath: string) => router.push(nativeBrowseHref(webPath) as any), [router]);
  const viewSong = useCallback((song: { song_id: string }) => router.push(`/song/${song.song_id}` as any), [router]);
  const { myConfidence, addSong } = useMySongs();
  // The Song Library's filters, scoped to this page's songs.
  const expanded = useMemo(() => expandFilterState(filters, hierarchy), [filters, hierarchy]);
  const facets = useMemo(() => deriveFilterFacets(meta, filters, hierarchy), [meta, filters, hierarchy]);
  const options = useMemo(() => deriveFilterOptions(meta, expanded), [meta, expanded]);
  const yearBounds = useMemo(() => {
    const years = meta.map(m => m.year).filter((y): y is number => y != null);
    return years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: null, max: null };
  }, [meta]);
  const activeCount = countActiveFilters(filters);
  const metaById = useMemo(() => new Map(meta.map(m => [m.song_id, m])), [meta]);
  const shownSongs = useMemo(
    () => (activeCount === 0 ? songs : songs.filter(s => { const m = metaById.get(s.song_id); return m ? songMatchesFilters(m, expanded) : false; })),
    [songs, activeCount, metaById, expanded]
  );

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
  return (
    <>
      <Stack.Screen options={{ title: entity.name, headerTintColor: '#d97706' }} />
      <ScrollView className="flex-1 bg-slate-50">
        <ContentContainer>
          <View className="px-4 pt-4 pb-12">
            <TouchableOpacity onPress={() => router.push('/browse' as any)}>
              <Text className="text-xs font-medium text-amber-700 uppercase tracking-wide">{KIND_LABEL[kind]}</Text>
            </TouchableOpacity>
            <Text className="text-2xl font-semibold text-slate-900 mt-1">{entity.name}</Text>
            {entity.subtitle ? <Text className="text-base text-slate-500">{entity.subtitle}</Text> : null}
            <Text className="text-sm text-slate-500 mt-1">
              {total} song{total === 1 ? '' : 's'}
              {members > 0 ? ` · ${members} member${members === 1 ? '' : 's'} know${members === 1 ? 's' : ''} at least one` : ''}
            </Text>
            {entity.notes ? <Text className="text-sm text-slate-600 mt-3">{entity.notes}</Text> : null}

            {(entity.parents.length > 0 || entity.children.length > 0 || entity.related.length > 0) && (
              <View className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
                <TagLinks label="Part of" tags={entity.parents} onPress={openTag} />
                <TagLinks label="Includes" tags={entity.children} onPress={openTag} />
                <TagLinks label="Related" tags={entity.related.filter(t => t.type === kind)} onPress={openTag} />
                <TagLinks label="See also" tags={entity.related.filter(t => t.type !== kind)} onPress={openTag} />
              </View>
            )}

            {songs.length > 1 && (
              <View className="flex-row items-center mt-4">
                <TouchableOpacity
                  onPress={() => setSheetOpen(true)}
                  className={`px-3 py-1.5 rounded-full border ${activeCount > 0 ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white'}`}
                >
                  <Text className={`text-xs font-medium ${activeCount > 0 ? 'text-amber-700' : 'text-zinc-500'}`}>Filters{activeCount > 0 ? ` · ${activeCount}` : ''}</Text>
                </TouchableOpacity>
                {activeCount > 0 ? <Text className="text-xs text-zinc-500 ml-2">{shownSongs.length} of {songs.length}</Text> : null}
              </View>
            )}
            <View className="mt-2 -mx-4">
              {shownSongs.length === 0 ? (
                <Text className="text-sm text-zinc-500 text-center py-8">{songs.length === 0 ? 'No songs here yet.' : 'No songs here match these filters.'}</Text>
              ) : shownSongs.map(s => (
                <SuggestionCard
                  key={s.song_id}
                  song={{ ...s, first_line: null, year: null, recording_artists: s.recording_artists ?? null }}
                  confidence={myConfidence.get(s.song_id) ?? null}
                  context={entity.roles.get(s.song_id) ?? null}
                  onAdd={addSong}
                  onView={viewSong}
                  onOpenBrowse={openBrowse}
                />
              ))}
            </View>
            {related.length > 0 && (
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
            )}
          </View>
        </ContentContainer>
      </ScrollView>
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
    </>
  );
}
