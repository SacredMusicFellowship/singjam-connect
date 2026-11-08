import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { browsePath, BROWSE_LIMIT, loadBrowseEntity, loadBrowseSongs, type BrowseEntity, type BrowseKind, type BrowseSongRow, type LinkedTag } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { browseKindFromSegment, nativeBrowseHref } from '@/lib/browseLinks';

const KIND_LABEL: Record<BrowseKind, string> = {
  genre: 'Genre', form: 'Form', occasion: 'Occasion', community: 'Community', culture: 'Culture',
  language: 'Language', theme: 'Theme', person: 'Songwriter', artist: 'Recording artist', show: 'Show',
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

  useEffect(() => {
    if (!kind || !slug) { setEntity(null); return; }
    let live = true;
    (async () => {
      const e = await loadBrowseEntity(supabase, kind, slug).catch(() => null);
      if (!live) return;
      setEntity(e);
      if (e) {
        const r = await loadBrowseSongs(supabase, e.songIds).catch(() => ({ songs: [], members: 0 }));
        if (live) { setSongs(r.songs); setMembers(r.members); }
      }
    })();
    return () => { live = false; };
  }, [kind, slug]);

  const openTag = (t: LinkedTag) => router.push(nativeBrowseHref(browsePath(t.type, t.slug)) as any);

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

            <View className="mt-4 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              {songs.length === 0 ? (
                <Text className="text-sm text-zinc-500 text-center py-8">No songs here yet.</Text>
              ) : songs.map((s, i) => {
                const show = s.production_credits?.[0];
                const line = [entity.roles.get(s.song_id), s.byline ?? s.display_artist].filter(Boolean).join(' · ');
                return (
                  <TouchableOpacity key={s.song_id} onPress={() => router.push(`/song/${s.song_id}` as any)} className={`flex-row items-baseline px-4 py-3 ${i > 0 ? 'border-t border-zinc-100' : ''}`}>
                    <View className="flex-1 mr-3">
                      <Text className="font-medium text-zinc-900">{s.title}</Text>
                      <Text className="text-sm text-zinc-500" numberOfLines={1}>
                        {kind !== 'show' && show ? `from ${show.name}${show.year ? ` (${show.year})` : ''}${line ? ' · ' : ''}` : ''}{line}
                      </Text>
                    </View>
                    {s.popularity > 0 ? <Text className="text-xs text-zinc-400">{s.popularity} know{s.popularity === 1 ? 's' : ''} it</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
            {total > BROWSE_LIMIT && (
              <Text className="text-sm text-zinc-500 mt-2">Showing the {BROWSE_LIMIT} best-known.</Text>
            )}
          </View>
        </ContentContainer>
      </ScrollView>
    </>
  );
}
