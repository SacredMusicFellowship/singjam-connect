import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, Alert, Image, ScrollView, ActivityIndicator } from 'react-native';
import { Redirect, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { unregisterPushToken } from '@/lib/push';
import { useAuth } from '@/lib/auth-context';
import BrandHeader from '@/components/BrandHeader';
import ContentContainer from '@/components/ContentContainer';

type Profile = {
  display_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
  singing_voice: string | null;
  neighborhood: string | null;
  instrument_levels: Record<string, string> | null;
  favorite_genres: string[] | null;
};

const SINGING_LABEL: Record<string, string> = {
  lead: 'Lead vocals',
  backup: 'Backup vocals',
};

// Matches web's voiceBadgeClass in @singjam/core
const VOICE_BADGE: Record<string, { box: string; text: string }> = {
  lead: { box: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  backup: { box: 'bg-violet-50 border-violet-200', text: 'text-violet-700' },
};

function ProfileCard({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
      {label ? (
        <Text className="mb-3 text-xs font-medium uppercase tracking-wide text-zinc-400">{label}</Text>
      ) : null}
      {children}
    </View>
  );
}

function SkeletonProfile() {
  return (
    <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-5">
      <View className="flex-row items-center" style={{ gap: 16 }}>
        <View className="h-20 w-20 rounded-full bg-zinc-200" />
        <View className="flex-1 gap-2">
          <View className="h-5 w-36 rounded bg-zinc-200" />
          <View className="h-4 w-24 rounded bg-zinc-100" />
        </View>
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const router = useRouter();

  useFocusEffect(
    useCallback(() => {
      async function load() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setEmail(user.email ?? null);
        const { data } = await supabase
          .from('profiles')
          .select('display_name, last_name, username, avatar_url, singing_voice, neighborhood, instrument_levels, favorite_genres')
          .eq('id', user.id)
          .single();
        setProfile(data);
        setLoading(false);
      }
      load();
    }, [])
  );

  const { session, initialised } = useAuth();
  // The tab bar sends a guest straight to auth (see (tabs)/_layout.tsx); this
  // covers the other ways of landing here — signing out, or a deep link.
  if (initialised && !session) return <Redirect href={'/(auth)/sign-in' as any} />;

  async function uploadAvatar(asset: ImagePicker.ImagePickerAsset) {
    setUploadingAvatar(true);
    try {
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const path = `${user.id}.${ext}`;
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      if (blob.size > 5 * 1024 * 1024) {
        Alert.alert('Avatar too large', 'Avatar must be under 5 MB.');
        return;
      }

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });

      if (uploadError) { Alert.alert('Upload failed', uploadError.message); return; }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const avatarUrl = `${publicUrl}?t=${Date.now()}`;

      await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
      setProfile(prev => prev ? { ...prev, avatar_url: avatarUrl } : prev);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to change your avatar.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await uploadAvatar(result.assets[0]);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) await uploadAvatar(result.assets[0]);
  }

  function handleAvatarPress() {
    Alert.alert('Change Photo', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await unregisterPushToken();
          supabase.auth.signOut();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const fullName = [profile?.display_name, profile?.last_name].filter(Boolean).join(' ');
  const displayName = fullName || email || '';
  const initial = displayName[0]?.toUpperCase() ?? '?';

  const singingVoices = profile?.singing_voice
    ? profile.singing_voice.split(',').filter(v => v && v !== 'none')
    : [];

  const instrumentEntries = profile?.instrument_levels
    ? Object.entries(profile.instrument_levels).filter(([, level]) => level)
    : [];

  const favoriteGenres = [...(profile?.favorite_genres ?? [])].sort((a, b) => a.localeCompare(b));

  return (
    <View className="flex-1 bg-slate-50">
      <BrandHeader />
      <ContentContainer>
      <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 32 }}>
      {loading ? (
        <SkeletonProfile />
      ) : (
        <>
          <ProfileCard>
            <View className="flex-row items-center" style={{ gap: 16 }}>
              <TouchableOpacity onPress={handleAvatarPress} className="relative">
                {profile?.avatar_url ? (
                  <Image source={{ uri: profile.avatar_url }} className="h-20 w-20 rounded-full" />
                ) : (
                  <View className="h-20 w-20 items-center justify-center rounded-full bg-zinc-100">
                    <Text className="text-3xl text-zinc-400">{initial}</Text>
                  </View>
                )}
                {uploadingAvatar ? (
                  <View className="absolute inset-0 items-center justify-center rounded-full bg-black/40">
                    <ActivityIndicator color="white" size="small" />
                  </View>
                ) : (
                  <View className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-zinc-700">
                    <Ionicons name="camera" size={10} color="white" />
                  </View>
                )}
              </TouchableOpacity>
              <View className="min-w-0 flex-1">
                <Text className="text-xl font-semibold text-zinc-900" numberOfLines={1}>{displayName}</Text>
                {profile?.username ? (
                  <Text className="text-sm text-zinc-500">@{profile.username}</Text>
                ) : null}
                {profile?.neighborhood ? (
                  <Text className="mt-1 text-sm text-zinc-500">{profile.neighborhood}</Text>
                ) : null}
              </View>
            </View>
          </ProfileCard>

          {singingVoices.length > 0 && (
            <ProfileCard label="Singing">
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {singingVoices.map((v) => {
                  const badge = VOICE_BADGE[v] ?? { box: 'bg-zinc-50 border-zinc-200', text: 'text-zinc-600' };
                  return (
                    <View key={v} className={`rounded-full border px-3 py-1 ${badge.box}`}>
                      <Text className={`text-sm ${badge.text}`}>{SINGING_LABEL[v] ?? v}</Text>
                    </View>
                  );
                })}
              </View>
            </ProfileCard>
          )}

          {instrumentEntries.length > 0 && (
            <ProfileCard label="Instruments">
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {instrumentEntries.map(([name, level]) => (
                  <View key={name} className="flex-row items-center rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1" style={{ gap: 6 }}>
                    <Text className="text-sm font-medium text-zinc-700">{name}</Text>
                    <Text className="text-sm text-zinc-400">·</Text>
                    <Text className="text-sm text-zinc-500">{level}</Text>
                  </View>
                ))}
              </View>
            </ProfileCard>
          )}

          {favoriteGenres.length > 0 && (
            <ProfileCard label="Favorite genres">
              <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                {favoriteGenres.map((g) => (
                  <View key={g} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1">
                    <Text className="text-sm text-zinc-700">{g}</Text>
                  </View>
                ))}
              </View>
            </ProfileCard>
          )}
        </>
      )}

      <View className="mx-4 mt-6 flex-row" style={{ gap: 8 }}>
        <TouchableOpacity
          onPress={() => router.push('/profile-edit')}
          className="flex-1 items-center rounded-full border border-zinc-200 bg-white px-4 py-2.5"
        >
          <Text className="text-sm text-zinc-600">Edit profile</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSignOut}
          className="items-center rounded-full border border-zinc-200 bg-white px-4 py-2.5"
        >
          <Text className="text-sm text-zinc-600">Log out</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => router.push('/account' as any)}
        className="mx-4 mt-2 items-center rounded-full border border-zinc-200 bg-white px-4 py-2.5"
      >
        <Text className="text-sm text-zinc-600">Account settings</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/feedback' as any)}
        className="mx-4 mt-2 items-center rounded-full border border-zinc-200 bg-white px-4 py-2.5"
      >
        <Text className="text-sm text-zinc-600">Report a bug</Text>
      </TouchableOpacity>
      </ScrollView>
      </ContentContainer>
    </View>
  );
}
