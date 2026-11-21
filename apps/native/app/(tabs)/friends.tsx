import { useState, useCallback, useRef } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  RefreshControl, ActivityIndicator, Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import InviteToJamModal from '@/components/InviteToJamModal';
import BrandHeader from '@/components/BrandHeader';
import ContentContainer from '@/components/ContentContainer';
import PromptCard from '@/components/PromptCard';

type Match = {
  user_id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  neighborhood: string | null;
  shared_count: number;
  top_shared: string[];
  shared_genres: string[];
  singing_voice: string | null;
  instrument_levels: Record<string, string> | null;
};

type SearchResult = {
  id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

const SINGING_LABEL: Record<string, string> = { lead: 'Lead vocals', backup: 'Backup vocals' };
const SINGING_ORDER = ['lead', 'backup'];
const INSTRUMENT_ORDER = ['Professional', 'Advanced', 'Intermediate', 'Beginner'];

function singingBadgeStyle(voice: string) {
  return voice === 'lead'
    ? 'bg-amber-50 border-amber-200'
    : 'bg-zinc-100 border-zinc-200';
}
function singingTextStyle(voice: string) {
  return voice === 'lead' ? 'text-amber-700' : 'text-zinc-600';
}

function Avatar({ uri, name }: { uri: string | null; name: string }) {
  const initial = name[0]?.toUpperCase() ?? '?';
  if (uri) {
    return (
      <Image
        source={{ uri }}
        className="w-10 h-10 rounded-full"
      />
    );
  }
  return (
    <View className="w-10 h-10 rounded-full bg-zinc-200 items-center justify-center">
      <Text className="text-zinc-600 font-semibold text-sm">{initial}</Text>
    </View>
  );
}

function SkeletonCard() {
  return (
    <View className="mx-4 mb-3 rounded-2xl border border-zinc-100 bg-white p-4">
      <View className="flex-row items-center">
        <View className="w-10 h-10 rounded-full bg-zinc-200" />
        <View className="flex-1 ml-3 gap-1.5">
          <View className="h-4 w-32 bg-zinc-200 rounded" />
          <View className="h-3 w-20 bg-zinc-100 rounded" />
        </View>
        <View className="items-end gap-1">
          <View className="h-4 w-6 bg-zinc-200 rounded" />
          <View className="h-3 w-16 bg-zinc-100 rounded" />
        </View>
      </View>
      <View className="flex-row gap-1.5 mt-3">
        <View className="h-5 w-20 bg-zinc-100 rounded-full" />
        <View className="h-5 w-16 bg-zinc-100 rounded-full" />
      </View>
    </View>
  );
}

function MatchCard({ match, onPress, onInvite }: { match: Match; onPress: () => void; onInvite: () => void }) {
  const fullName = [match.display_name, match.last_name].filter(Boolean).join(' ');
  const displayName = fullName || match.username || 'Someone';

  const singingVoices = (match.singing_voice ?? '')
    .split(',')
    .filter((v) => v && v !== 'none')
    .sort((a, b) => SINGING_ORDER.indexOf(a) - SINGING_ORDER.indexOf(b));

  const topInstruments = Object.entries(match.instrument_levels ?? {})
    .sort(([, a], [, b]) => INSTRUMENT_ORDER.indexOf(a) - INSTRUMENT_ORDER.indexOf(b))
    .slice(0, 3)
    .map(([name]) => name);

  const topShared = (match.top_shared ?? []).slice(0, 5);
  const sharedGenres = (match.shared_genres ?? []).slice(0, 5);

  return (
    <TouchableOpacity
      onPress={onPress}
      className="mx-4 mb-3 rounded-2xl border border-zinc-100 bg-white p-4 active:bg-zinc-50"
    >
      <View className="flex-row items-center">
        <Avatar uri={match.avatar_url} name={displayName} />
        <View className="flex-1 ml-3 min-w-0">
          <Text className="font-semibold text-zinc-900" numberOfLines={1}>{displayName}</Text>
          {match.username ? (
            <Text className="text-xs text-zinc-400" numberOfLines={1}>@{match.username}</Text>
          ) : null}
          {match.neighborhood ? (
            <Text className="text-xs text-zinc-500" numberOfLines={1}>{match.neighborhood}</Text>
          ) : null}
        </View>
        <View className="items-end ml-3">
          <Text className="text-sm font-semibold text-zinc-900">{match.shared_count}</Text>
          <Text className="text-xs text-zinc-400">shared songs</Text>
        </View>
      </View>

      {(singingVoices.length > 0 || topInstruments.length > 0) ? (
        <View className="flex-row flex-wrap gap-1.5 mt-3">
          {singingVoices.map((v) => (
            <View key={v} className={`rounded-full border px-2.5 py-0.5 ${singingBadgeStyle(v)}`}>
              <Text className={`text-xs ${singingTextStyle(v)}`}>{SINGING_LABEL[v] ?? v}</Text>
            </View>
          ))}
          {topInstruments.map((name) => (
            <View key={name} className="rounded-full border border-zinc-200 bg-zinc-100 px-2.5 py-0.5">
              <Text className="text-xs text-zinc-600">{name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {topShared.length > 0 ? (
        <Text className="text-xs text-zinc-500 mt-2" numberOfLines={2}>
          <Text className="font-medium text-zinc-700">Shared songs: </Text>
          {topShared.join(', ')}
          {match.shared_count > 5 ? ` +${match.shared_count - 5} more` : ''}
        </Text>
      ) : null}

      {sharedGenres.length > 0 ? (
        <Text className="text-xs text-zinc-500 mt-1" numberOfLines={1}>
          <Text className="font-medium text-zinc-700">Shared genres: </Text>
          {sharedGenres.join(', ')}
        </Text>
      ) : null}

      <View className="flex-row gap-2 mt-3">
        <TouchableOpacity
          onPress={onPress}
          className="flex-1 border border-zinc-200 rounded-xl py-2 items-center"
        >
          <Text className="text-zinc-800 text-sm font-medium">View profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onInvite}
          className="flex-1 border border-zinc-200 rounded-xl py-2 items-center"
        >
          <Text className="text-zinc-800 text-sm font-medium">Invite to jam</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

function SearchResultCard({ user, onPress }: { user: SearchResult; onPress: () => void }) {
  const fullName = [user.display_name, user.last_name].filter(Boolean).join(' ');
  const displayName = fullName || user.username || 'Someone';

  return (
    <TouchableOpacity
      onPress={onPress}
      className="mx-4 mb-3 rounded-2xl border border-zinc-100 bg-white p-4 active:bg-zinc-50"
    >
      <View className="flex-row items-center">
        <Avatar uri={user.avatar_url} name={displayName} />
        <View className="flex-1 ml-3 min-w-0">
          <Text className="font-semibold text-zinc-900" numberOfLines={1}>{displayName}</Text>
          {user.username ? (
            <Text className="text-xs text-zinc-400">@{user.username}</Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function FriendsScreen() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [myId, setMyId] = useState('');
  const [hasRepertoire, setHasRepertoire] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteTarget, setInviteTarget] = useState<{ id: string; name: string } | null>(null);
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setRefreshing(false); return; }
    setMyId(user.id);

    const [matchRes, repertoireRes] = await Promise.all([
      supabase.rpc('match_jammers', { for_user_id: user.id, limit_n: 30 }),
      supabase.from('user_songs').select('song_id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);

    if (matchRes.error) setError('Could not load matches.');
    setMatches((matchRes.data ?? []) as Match[]);
    setHasRepertoire((repertoireRes.count ?? 0) > 0);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const { session, initialised } = useAuth();
  // Signed-out: mirror web's friends page — heading + subtitle kept, the search
  // box dropped (it needs a session), and the feature pitched in a card.
  if (initialised && !session) {
    return (
      <View className="flex-1 bg-slate-50">
        <BrandHeader />
        <ContentContainer>
          <View className="px-4 pt-4 pb-3 bg-white border-b border-zinc-100">
            <Text className="text-2xl font-bold text-zinc-900">Find jammers</Text>
            <Text className="text-zinc-500 text-sm mt-0.5">Matched by shared songs and genre overlap.</Text>
          </View>
          <View className="mt-4">
            <PromptCard
              variant="guest"
              title="See who you could jam with"
              body="SingJam matches you with musicians who know the same songs as you. Add songs to your repertoire and we'll rank your best potential jam partners."
              actionLabel="Sign in →"
              onAction={() => router.push('/(auth)/sign-in' as any)}
            />
          </View>
        </ContentContainer>
      </View>
    );
  }

  function handleSearchChange(text: string) {
    setQuery(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (text.trim().length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(() => runSearch(text.trim()), 300);
  }

  async function runSearch(q: string) {
    setSearching(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSearching(false); return; }
    const { data } = await supabase.rpc('search_users', {
      search_query: q.startsWith('@') ? q.slice(1) : q,
      exclude_user_id: user.id,
    });
    setSearchResults((data ?? []) as SearchResult[]);
    setSearching(false);
  }

  const isSearching = query.trim().length >= 2;

  return (
    <View className="flex-1 bg-slate-50">
      <InviteToJamModal
        visible={!!inviteTarget}
        inviteeUserId={inviteTarget?.id ?? ''}
        inviteeName={inviteTarget?.name ?? ''}
        onClose={() => setInviteTarget(null)}
      />

      <BrandHeader />
      <ContentContainer>
      <View className="px-4 pt-4 pb-3 bg-white border-b border-zinc-100">
        <Text className="text-2xl font-bold text-zinc-900 mb-3">Find jammers</Text>
        <View className="flex-row items-center bg-zinc-100 rounded-xl px-3 py-2">
          <Text className="text-zinc-400 mr-2">🔍</Text>
          <TextInput
            className="flex-1 text-zinc-900"
            placeholder="Search by name, username, or email"
            placeholderTextColor="#a1a1aa"
            value={query}
            onChangeText={handleSearchChange}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => { setQuery(''); setSearchResults([]); }}>
              <Text className="text-zinc-400 ml-2">✕</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <View className="pt-3">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : error ? (
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-red-500 text-sm text-center">{error}</Text>
        </View>
      ) : isSearching && searching ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#d97706" />
        </View>
      ) : isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SearchResultCard
              user={item}
              onPress={() => router.push({ pathname: '/profile/[id]' as any, params: { id: item.id } })}
            />
          )}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
          ListEmptyComponent={
            <View className="items-center justify-center pt-16 px-8">
              <Text className="text-zinc-500 font-medium mb-1">No users found</Text>
              <Text className="text-zinc-400 text-sm text-center">
                Try searching by first name or @username
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => {
            const fullName = [item.display_name, item.last_name].filter(Boolean).join(' ');
            const displayName = fullName || item.username || 'Someone';
            return (
              <MatchCard
                match={item}
                onPress={() => router.push({ pathname: '/profile/[id]' as any, params: { id: item.user_id } })}
                onInvite={() => setInviteTarget({ id: item.user_id, name: displayName })}
              />
            );
          }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#d97706"
            />
          }
          ListHeaderComponent={
            matches.length > 0 ? (
              <Text className="px-4 pb-2 text-sm text-zinc-500">
                Matches are ranked by shared songs and genre overlap.
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            !hasRepertoire ? (
              <PromptCard
                variant="nudge"
                title="Your repertoire is empty"
                body="Add songs you know and SingJam will match you with musicians who share your repertoire."
                actionLabel="Browse songs →"
                onAction={() => router.push('/songs' as any)}
              />
            ) : (
              <View className="mx-4 rounded-2xl border border-zinc-200 bg-white p-6 items-center">
                <Text className="text-base font-semibold text-zinc-900">No matches yet</Text>
                <Text className="mt-1 text-sm text-zinc-500 text-center">
                  As more musicians join and add songs, you'll start seeing matches here.
                </Text>
              </View>
            )
          }
        />
      )}
      </ContentContainer>
    </View>
  );
}
