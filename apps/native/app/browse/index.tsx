import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { loadBrowseHub, type BrowseChip, type BrowseHub } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { nativeBrowseHref } from '@/lib/browseLinks';

function ChipCloud({ chips, onPress }: { chips: BrowseChip[]; onPress: (href: string) => void }) {
  return (
    <View className="flex-row flex-wrap">
      {chips.map(c => (
        <TouchableOpacity key={c.href} onPress={() => onPress(c.href)} className="px-3 py-1.5 rounded-full border border-slate-200 bg-white mr-2 mb-2">
          <Text className="text-sm text-slate-700">{c.label}<Text className="text-slate-400">{`  ${c.count}`}</Text></Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Heading({ title }: { title: string }) {
  return <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 mt-6">{title}</Text>;
}

// Native counterpart of web's /browse hub.
export default function BrowseHubScreen() {
  const router = useRouter();
  const [hub, setHub] = useState<BrowseHub | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => { loadBrowseHub(supabase).then(setHub, () => setError(true)); }, []);
  const open = (href: string) => router.push(nativeBrowseHref(href) as any);

  return (
    <>
      <Stack.Screen options={{ title: 'Browse songs', headerTintColor: '#d97706' }} />
      <ScrollView className="flex-1 bg-slate-50">
        <ContentContainer>
          <View className="px-4 pb-12">
            <Text className="text-sm text-slate-500 mt-4">Numbers are songs on SingJam. A genre or occasion includes the kinds within it.</Text>
            {!hub && !error && <ActivityIndicator className="mt-10" color="#d97706" />}
            {error && <Text className="text-sm text-slate-500 mt-10 text-center">Couldn’t load the browse page. Pull back and try again.</Text>}
            {hub?.sections.map(s => (
              <View key={s.type}>
                <Heading title={s.title} />
                <ChipCloud chips={s.chips} onPress={open} />
              </View>
            ))}
            {hub && hub.writers.length > 0 && (<><Heading title="Songwriters" /><ChipCloud chips={hub.writers} onPress={open} /></>)}
            {hub && hub.artists.length > 0 && (<><Heading title="Recording artists" /><ChipCloud chips={hub.artists} onPress={open} /></>)}
            {hub && hub.shows.length > 0 && (
              <>
                <Heading title="Shows" />
                {hub.shows.map(g => (
                  <View key={g.medium}>
                    <Text className="text-sm text-slate-600 mb-1.5">{g.label}</Text>
                    <ChipCloud chips={g.chips} onPress={open} />
                  </View>
                ))}
              </>
            )}
          </View>
        </ContentContainer>
      </ScrollView>
    </>
  );
}
