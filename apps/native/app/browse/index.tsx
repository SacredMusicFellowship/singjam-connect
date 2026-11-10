import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { loadBrowseHub, sortBrowseHub, type BrowseChip, type BrowseHub, type BrowseHubOrder } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { nativeBrowseHref } from '@/lib/browseLinks';
import OrderToggle, { COUNT_OR_AZ } from '@/components/OrderToggle';

const TOP_N = 24;

// A section's most-used entries, and everything on "Show all" (for genres,
// occasions and communities that adds the kinds within each) — as on web.
function ChipCloud({ chips, all, more, onPress }: {
  chips: BrowseChip[];
  all?: BrowseChip[];
  more?: { href: string; label: string };
  onPress: (href: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const full = all ?? chips;
  const shown = expanded ? full : chips.slice(0, TOP_N);
  return (
    <View className="flex-row flex-wrap">
      {shown.map(c => (
        <TouchableOpacity key={c.href} onPress={() => onPress(c.href)} className="px-3 py-1.5 rounded-full border border-slate-200 bg-white mr-2 mb-2">
          <Text className="text-sm text-slate-700">{c.label}<Text className="text-slate-400">{`  ${c.count}`}</Text></Text>
        </TouchableOpacity>
      ))}
      {!expanded && full.length > shown.length && (
        <TouchableOpacity onPress={() => setExpanded(true)} className="px-3 py-1.5 mb-2">
          <Text className="text-sm font-medium text-amber-600">Show all {full.length}</Text>
        </TouchableOpacity>
      )}
      {expanded && full.length > TOP_N && (
        <TouchableOpacity onPress={() => setExpanded(false)} className="px-3 py-1.5 mb-2">
          <Text className="text-sm font-medium text-amber-600">Show fewer</Text>
        </TouchableOpacity>
      )}
      {more && (
        <TouchableOpacity onPress={() => onPress(more.href)} className="px-3 py-1.5 mb-2">
          <Text className="text-sm font-medium text-amber-600">{more.label}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Heading({ title }: { title: string }) {
  return <Text className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 mt-6">{title}</Text>;
}

// Native counterpart of web's /browse hub.
export default function BrowseHubScreen() {
  const router = useRouter();
  const [loaded, setHub] = useState<BrowseHub | null>(null);
  const [order, setOrder] = useState<BrowseHubOrder>('count');
  const hub = loaded ? sortBrowseHub(loaded, order) : null;
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
            {hub && (
              <OrderToggle value={order} onChange={setOrder} options={COUNT_OR_AZ} className="mt-3" />
            )}
            {!hub && !error && <ActivityIndicator className="mt-10" color="#d97706" />}
            {error && <Text className="text-sm text-slate-500 mt-10 text-center">Couldn’t load the browse page. Pull back and try again.</Text>}
            {hub?.sections.slice(0, 1).map(s => (
              <View key={s.type}>
                <Heading title={s.title} />
                <ChipCloud chips={s.chips} all={s.all} onPress={open} />
              </View>
            ))}
            {hub && hub.traditional.length > 0 && (
              <><Heading title="Traditional songs" /><ChipCloud chips={hub.traditional} more={{ href: '/people/traditional', label: 'All traditional songs' }} onPress={open} /></>
            )}
            {hub?.sections.slice(1).map(s => (
              <View key={s.type}>
                <Heading title={s.title} />
                <ChipCloud chips={s.chips} all={s.all} onPress={open} />
              </View>
            ))}
            {hub && hub.scripture.length > 0 && (
              <><Heading title="Scripture" /><ChipCloud chips={hub.scripture} onPress={open} /></>
            )}
            {hub && hub.shows.length > 0 && (
              <>
                <Heading title="Stage & screen" />
                {hub.shows.map(g => (
                  <View key={g.medium}>
                    <Text className="text-sm text-slate-600 mb-1.5">{g.label}</Text>
                    <ChipCloud chips={g.chips} onPress={open} />
                  </View>
                ))}
              </>
            )}
            {hub && hub.writers.length > 0 && (
              <><Heading title="Songwriters" /><ChipCloud chips={hub.writers} more={{ href: '/people', label: `See all ${hub.writerTotal} songwriters` }} onPress={open} /></>
            )}
            {hub && hub.artists.length > 0 && (
              <><Heading title="Recording artists" /><ChipCloud chips={hub.artists} more={{ href: '/artists', label: `See all ${hub.artistTotal} recording artists` }} onPress={open} /></>
            )}
          </View>
        </ContentContainer>
      </ScrollView>
    </>
  );
}
