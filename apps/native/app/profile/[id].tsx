import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, Image, ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import SignInPrompt from '@/components/SignInPrompt';
import { fetchProfileSongs } from '@singjam/core';
import InviteToJamModal from '@/components/InviteToJamModal';
import ContentContainer from '@/components/ContentContainer';

type Profile = {
  id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  neighborhood: string | null;
  singing_voice: string | null;
  instrument_levels: Record<string, string> | null;
};

type Song = { song_id: string; title: string; display_artist: string | null; byline?: string | null; confidence: string | null };

const SINGING_LABEL: Record<string, string> = { lead: 'Lead vocals', backup: 'Backup vocals' };
const LEVEL_ORDER = ['Professional', 'Advanced', 'Intermediate', 'Beginner'];

function sortedInstruments(levels: Record<string, string>): [string, string][] {
  return Object.entries(levels).sort(([, a], [, b]) => {
    const ai = LEVEL_ORDER.indexOf(a);
    const bi = LEVEL_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

function Avatar({ profile }: { profile: Profile }) {
  const fullName = [profile.display_name, profile.last_name].filter(Boolean).join(' ');
  const initial = (fullName || profile.username || '?')[0]?.toUpperCase() ?? '?';

  if (profile.avatar_url) {
    return <Image source={{ uri: profile.avatar_url }} className="w-20 h-20 rounded-full" />;
  }
  return (
    <View className="w-20 h-20 rounded-full bg-amber-500 items-center justify-center">
      <Text className="text-white text-3xl font-semibold">{initial}</Text>
    </View>
  );
}

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [sharedSongs, setSharedSongs] = useState<Song[]>([]);
  const [additionalSongs, setAdditionalSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      setMyId(user?.id ?? null);

      const { data } = await supabase
        .from('profiles')
        .select('id, display_name, last_name, username, avatar_url, neighborhood, singing_voice, instrument_levels')
        .eq('id', id)
        .maybeSingle();

      if (!data) { setNotFound(true); setLoading(false); return; }
      setProfile(data as Profile);

      const { sharedSongs: shared, additionalSongs: additional } = await fetchProfileSongs(supabase, data.id);
      setSharedSongs(shared as Song[]);
      setAdditionalSongs(additional as Song[]);
      setLoading(false);
    }
    if (id) load();
  }, [id]);

  const { session, initialised } = useAuth();
  if (initialised && !session) return <SignInPrompt message="Sign in to view profiles" />;

  const fullName = profile ? [profile.display_name, profile.last_name].filter(Boolean).join(' ') : '';
  const displayName = fullName || profile?.username || '';

  const singingLabels = profile?.singing_voice
    ? profile.singing_voice.split(',').filter(Boolean).map(v => SINGING_LABEL[v] ?? v)
    : [];

  const instruments = profile?.instrument_levels ? sortedInstruments(profile.instrument_levels) : [];

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <View className="flex-1 items-center justify-center bg-white">
          <ActivityIndicator color="#d97706" />
        </View>
      </>
    );
  }

  if (notFound || !profile) {
    return (
      <>
        <Stack.Screen options={{ title: 'Profile' }} />
        <View className="flex-1 items-center justify-center bg-white px-8">
          <Text className="text-zinc-900 font-semibold text-base mb-1">Profile not found</Text>
          <Text className="text-zinc-400 text-sm text-center">
            This user may have deleted their account.
          </Text>
        </View>
      </>
    );
  }

  const isOwnProfile = myId === profile.id;

  return (
    <>
      <Stack.Screen options={{ title: displayName, headerTintColor: '#d97706' }} />
      <InviteToJamModal
        visible={showInvite}
        inviteeUserId={profile.id}
        inviteeName={displayName}
        onClose={() => setShowInvite(false)}
      />
      <ContentContainer style={{ backgroundColor: 'white' }}>
      <ScrollView className="flex-1 bg-white">
        {/* Header */}
        <View className="items-center px-4 pt-8 pb-6 border-b border-zinc-100">
          <Avatar profile={profile} />
          <Text className="text-xl font-bold text-zinc-900 mt-3">{displayName}</Text>
          {profile.username ? (
            <Text className="text-zinc-400 mt-0.5">@{profile.username}</Text>
          ) : null}
          {profile.neighborhood ? (
            <Text className="text-zinc-400 text-sm mt-1">📍 {profile.neighborhood}</Text>
          ) : null}

          {/* Singing voice */}
          {singingLabels.length > 0 && (
            <View className="flex-row flex-wrap justify-center gap-2 mt-3">
              {singingLabels.map(label => (
                <View key={label} className="bg-amber-100 rounded-full px-3 py-1">
                  <Text className="text-amber-800 text-xs font-semibold">{label}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Actions */}
          {isOwnProfile ? (
            <TouchableOpacity
              onPress={() => router.push('/profile-edit')}
              className="mt-4 border border-zinc-200 rounded-full px-4 py-1.5"
            >
              <Text className="text-zinc-600 text-sm font-medium">Edit profile</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => setShowInvite(true)}
              className="mt-4 bg-amber-500 rounded-full px-5 py-2"
            >
              <Text className="text-white text-sm font-semibold">Invite to jam</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Instruments */}
        {instruments.length > 0 && (
          <View className="px-4 pt-5 pb-4 border-b border-zinc-100">
            <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
              Instruments
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {instruments.map(([name, level]) => (
                <View key={name} className="flex-row items-center bg-zinc-50 border border-zinc-200 rounded-full px-3 py-1">
                  <Text className="text-zinc-800 text-sm font-medium">{name}</Text>
                  <Text className="text-zinc-400 text-xs ml-1">· {level}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Shared songs */}
        {!isOwnProfile && sharedSongs.length > 0 && (
          <View className="px-4 pt-5 pb-4 border-b border-zinc-100">
            <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
              Songs you both know ({sharedSongs.length})
            </Text>
            {sharedSongs.map(song => (
              <View key={song.song_id} className="py-2 border-b border-zinc-50 last:border-0">
                <Text className="text-zinc-900 font-medium" numberOfLines={1}>{song.title}</Text>
                {song.byline ? (
                  <Text className="text-sm text-zinc-400" numberOfLines={1}>{song.byline}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {/* Their other songs */}
        {additionalSongs.length > 0 && (
          <View className="px-4 pt-5 pb-8">
            <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">
              {isOwnProfile ? 'Your repertoire' : 'Their repertoire'} ({additionalSongs.length})
            </Text>
            {additionalSongs.slice(0, 20).map(song => (
              <View key={song.song_id} className="py-2 border-b border-zinc-50 last:border-0">
                <Text className="text-zinc-900" numberOfLines={1}>{song.title}</Text>
                {song.byline ? (
                  <Text className="text-sm text-zinc-400" numberOfLines={1}>{song.byline}</Text>
                ) : null}
              </View>
            ))}
            {additionalSongs.length > 20 && (
              <Text className="text-zinc-400 text-sm mt-3">
                + {additionalSongs.length - 20} more songs
              </Text>
            )}
          </View>
        )}

        {sharedSongs.length === 0 && additionalSongs.length === 0 && !isOwnProfile && (
          <View className="items-center py-12 px-8">
            <Ionicons name="musical-notes-outline" size={36} color="#d4d4d8" />
            <Text className="text-zinc-400 text-sm text-center mt-3">
              No repertoire to show yet.
            </Text>
          </View>
        )}
      </ScrollView>
      </ContentContainer>
    </>
  );
}
