import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { loadBrowseIndex, type BrowseChip } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { nativeBrowseHref } from '@/lib/browseLinks';

// Every songwriter or recording artist with songs, A–Z — web's /people and
// /artists. A search box stands in for web's jump-to-letter row.
export default function BrowseIndexScreen() {
  const { kind: segment } = useLocalSearchParams<{ kind: string }>();
  const router = useRouter();
  const kind = segment === 'people' ? 'person' : segment === 'artists' ? 'artist' : null;
  const title = kind === 'person' ? 'Songwriters' : 'Recording artists';
  const [chips, setChips] = useState<BrowseChip[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!kind) return;
    loadBrowseIndex(supabase, kind).then(setChips, () => setChips([]));
  }, [kind]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? (chips ?? []).filter(c => c.label.toLowerCase().includes(q)) : chips ?? [];
  }, [chips, query]);

  if (!kind) {
    return (<><Stack.Screen options={{ title: 'Not found', headerTintColor: '#d97706' }} /><Text className="text-sm text-slate-500 mt-16 text-center">This page doesn’t exist.</Text></>);
  }
  return (
    <>
      <Stack.Screen options={{ title, headerTintColor: '#d97706' }} />
      <ContentContainer>
        <View className="flex-1 bg-slate-50">
          <TextInput
            className="mx-4 mt-3 mb-2 border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900 bg-white"
            placeholder={`Find a ${kind === 'person' ? 'songwriter' : 'recording artist'}`}
            placeholderTextColor="#a1a1aa"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {chips === null ? (
            <ActivityIndicator className="mt-10" color="#d97706" />
          ) : (
            <FlatList
              data={shown}
              keyExtractor={c => c.href}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => router.push(nativeBrowseHref(item.href) as any)} className="px-4 py-3 border-b border-zinc-100 bg-white flex-row justify-between">
                  <Text className="text-zinc-900">{item.label}</Text>
                  <Text className="text-zinc-400">{item.count}</Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text className="text-sm text-zinc-500 text-center mt-10">No matches.</Text>}
            />
          )}
        </View>
      </ContentContainer>
    </>
  );
}
