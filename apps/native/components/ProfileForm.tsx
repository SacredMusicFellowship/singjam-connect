import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  Modal, FlatList, Image, Alert,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import {
  USERNAME_REGEX, USERNAME_MIN_LENGTH, RESERVED_USERNAMES, normalizeUsername, suggestUsername,
  deriveNeighborhood,
} from '@singjam/core';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';
const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

// React Native's Blob cannot be built from an ArrayBuffer, so `fetch(uri).blob()`
// throws on file:// URIs. Decode the picker's base64 into bytes and upload those.
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

type PlaceSuggestion = { label: string; value: string; placeId: string };

type Props = {
  title: string;
  subtitle: string;
  submitLabel: string;
  onSave: () => void;
};

const ALL_INSTRUMENTS = [
  'Guitar', 'Electric Bass', 'Upright Bass', 'Piano/Keys', 'Drums', 'Percussion',
  'Violin/Fiddle', 'Viola', 'Cello', 'Banjo', 'Mandolin', 'Ukulele', 'Flute',
  'Clarinet', 'Saxophone', 'Trumpet', 'Trombone', 'Harmonica', 'Accordion', 'Harp',
  'Dobro', 'Pedal Steel', 'Organ', 'Synthesizer',
  'Sitar', 'Tabla', 'Harmonium', 'Sarod', 'Bansuri', 'Veena', 'Mridangam',
  'Sarangi', 'Tanpura', 'Dholak', 'Oud', 'Darbuka', 'Qanun', 'Ney', 'Riq',
  'Rebab', 'Buzuq', 'Djembe', 'Kora', 'Mbira', 'Balafon', 'Kalimba',
  'Talking Drum', 'Ngoni', 'Shekere', 'Dundun', 'Erhu', 'Guzheng', 'Pipa',
  'Shamisen', 'Koto', 'Shakuhachi', 'Gayageum', 'Dizi', 'Taiko', 'Other',
];
const FEATURED_INSTRUMENTS = [
  'Guitar', 'Piano/Keys', 'Electric Bass', 'Upright Bass', 'Drums', 'Percussion',
  'Violin/Fiddle', 'Cello', 'Saxophone', 'Clarinet', 'Trumpet',
];
const INSTRUMENT_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Professional'] as const;
type InstrumentLevel = typeof INSTRUMENT_LEVELS[number];

const LEVEL_COLOR: Record<InstrumentLevel, string> = {
  Beginner: 'bg-zinc-100 text-zinc-500',
  Intermediate: 'bg-sky-50 text-sky-700',
  Advanced: 'bg-amber-50 text-amber-700',
  Professional: 'bg-green-50 text-green-700',
};

// ── Location modal ────────────────────────────────────────────────────────────

function LocationModal({
  visible,
  initial,
  onClose,
  onSelect,
}: {
  visible: boolean;
  initial: string;
  onClose: () => void;
  onSelect: (value: string) => void;
}) {
  const [query, setQuery] = useState(initial);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) setQuery(initial);
  }, [visible, initial]);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) { setSuggestions([]); return; }
    timer.current = setTimeout(() => fetchSuggestions(query.trim()), 300);
  }, [query]);

  async function fetchSuggestions(q: string) {
    setSearching(true);
    try {
      const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': PLACES_KEY },
        body: JSON.stringify({
          input: q,
          includedPrimaryTypes: ['locality', 'sublocality'],
          languageCode: 'en',
        }),
      });
      const json = await res.json();
      setSuggestions(
        (json.suggestions ?? [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => {
            const sf = s.placePrediction.structuredFormat;
            const mainText = sf?.mainText?.text ?? s.placePrediction.text.text;
            const secondaryText = sf?.secondaryText?.text;
            return {
              label: secondaryText ? `${mainText}, ${secondaryText}` : mainText,
              value: deriveNeighborhood(mainText, secondaryText, true),
              placeId: s.placePrediction.placeId,
            };
          })
      );
    } catch {
      setSuggestions([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-row items-center px-4 pt-4 pb-2 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900">Your Location</Text>
          <View style={{ width: 50 }} />
        </View>

        <View className="px-4 py-3 border-b border-zinc-100">
          <View className="flex-row items-center bg-zinc-100 rounded-xl px-3 py-2">
            <Text className="text-zinc-400 mr-2">🔍</Text>
            <TextInput
              className="flex-1 text-zinc-900"
              placeholder="Search city or neighborhood…"
              placeholderTextColor="#a1a1aa"
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="words"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); }}>
                <Text className="text-zinc-400 ml-2">✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {searching ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#d97706" />
          </View>
        ) : (
          <FlatList
            data={suggestions}
            keyExtractor={(item) => item.placeId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() => { onSelect(item.value); onClose(); }}
                className="px-4 py-3 border-b border-zinc-100"
              >
                <Text className="text-zinc-900">📍 {item.label}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              query.length >= 2 ? (
                <View className="items-center justify-center pt-12">
                  <Text className="text-zinc-400">No results found</Text>
                </View>
              ) : undefined
            }
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Inline instrument search (featured chips + search + results) ─────────────
// Instrument selection stays inline; picking one hands the name and the press
// event up so the parent can prompt for a level in an anchored action sheet.

function InstrumentSearch({
  added,
  onSelect,
}: {
  added: Record<string, string>;
  onSelect: (name: string, event: GestureResponderEvent) => void;
}) {
  const [query, setQuery] = useState('');
  const available = ALL_INSTRUMENTS.filter(i => !added[i]);
  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed ? available.filter(i => i.toLowerCase().includes(trimmed)) : [];
  const featured = FEATURED_INSTRUMENTS.filter(i => !added[i]);

  return (
    <View>
      {featured.length > 0 && !trimmed && (
        <View className="flex-row flex-wrap gap-2 mb-2">
          {featured.map(i => (
            <TouchableOpacity
              key={i}
              onPress={(e) => onSelect(i, e)}
              className="border border-zinc-200 rounded-full px-3 py-1.5"
            >
              <Text className="text-sm text-zinc-700">+ {i}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <View className="flex-row items-center border border-zinc-300 rounded-xl px-3 py-2">
        <Ionicons name="search" size={16} color="#a1a1aa" style={{ marginRight: 6 }} />
        <TextInput
          className="flex-1 text-zinc-900"
          placeholder="Search all instruments…"
          placeholderTextColor="#a1a1aa"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="words"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color="#a1a1aa" />
          </TouchableOpacity>
        )}
      </View>
      {trimmed.length > 0 && (
        <View className="mt-1 rounded-xl border border-zinc-200 overflow-hidden">
          {filtered.length > 0 ? filtered.map(i => (
            <TouchableOpacity
              key={i}
              onPress={(e) => { onSelect(i, e); setQuery(''); }}
              className="px-3 py-2.5 border-b border-zinc-100"
            >
              <Text className="text-zinc-900">{i}</Text>
            </TouchableOpacity>
          )) : (
            <View className="px-3 py-2.5">
              <Text className="text-zinc-400">No matches</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Inline genre search (top chips + search + results) ───────────────────────
// Mirrors web AccountPanel's GenreSearch.

function GenreSearch({
  allGenres,
  selected,
  topGenres,
  onToggle,
}: {
  allGenres: string[];
  selected: string[];
  topGenres: string[];
  onToggle: (genre: string) => void;
}) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const available = allGenres.filter(g => !selected.includes(g));
  const filtered = trimmed ? available.filter(g => g.toLowerCase().includes(trimmed)) : [];

  return (
    <View>
      {topGenres.length > 0 && !trimmed && (
        <View className="flex-row flex-wrap gap-2 mb-2">
          {topGenres.map(g => {
            const isSelected = selected.includes(g);
            return (
              <TouchableOpacity
                key={g}
                onPress={() => onToggle(g)}
                className={`rounded-full border px-3 py-1.5 ${isSelected ? 'bg-zinc-900 border-zinc-900' : 'border-zinc-200'}`}
              >
                <Text className={`text-sm ${isSelected ? 'text-white' : 'text-zinc-700'}`}>
                  {isSelected ? `✓ ${g}` : `+ ${g}`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
      <View className="flex-row items-center border border-zinc-300 rounded-xl px-3 py-2">
        <Ionicons name="search" size={16} color="#a1a1aa" style={{ marginRight: 6 }} />
        <TextInput
          className="flex-1 text-zinc-900"
          placeholder="Search all genres…"
          placeholderTextColor="#a1a1aa"
          value={query}
          onChangeText={setQuery}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')}>
            <Ionicons name="close-circle" size={16} color="#a1a1aa" />
          </TouchableOpacity>
        )}
      </View>
      {trimmed.length > 0 && (
        <View className="mt-1 rounded-xl border border-zinc-200 overflow-hidden">
          {filtered.length > 0 ? filtered.map(g => (
            <TouchableOpacity
              key={g}
              onPress={() => { onToggle(g); setQuery(''); }}
              className="px-3 py-2.5 border-b border-zinc-100"
            >
              <Text className="text-zinc-900">{g}</Text>
            </TouchableOpacity>
          )) : (
            <View className="px-3 py-2.5">
              <Text className="text-zinc-400">No matches</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── ProfileForm ───────────────────────────────────────────────────────────────

export default function ProfileForm({ title, subtitle, submitLabel, onSave }: Props) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [neighborhood, setNeighborhood] = useState('');
  const [singing, setSinging] = useState<Set<string>>(new Set());
  const [instruments, setInstruments] = useState<Record<string, string>>({});
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const usernameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userId = useRef<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      userId.current = user.id;
      const [{ data }, genreResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('display_name, last_name, username, avatar_url, singing_voice, neighborhood, instrument_levels, favorite_genres')
          .eq('id', user.id)
          .single(),
        supabase.rpc('genres_by_usage'),
      ]);
      if (data?.display_name) setFirstName(data.display_name);
      if (data?.last_name) setLastName(data.last_name);
      if (data?.username) setUsername(data.username);
      else if (user.email) setUsername(suggestUsername(user.email));
      if (data?.avatar_url) setAvatarUrl(data.avatar_url);
      if (data?.neighborhood) setNeighborhood(data.neighborhood);
      if (data?.singing_voice) setSinging(new Set(data.singing_voice.split(',').filter(Boolean)));
      if (data?.instrument_levels && typeof data.instrument_levels === 'object') {
        setInstruments(data.instrument_levels as Record<string, string>);
      }
      if (data?.favorite_genres) setFavoriteGenres(data.favorite_genres as string[]);
      // Prefer usage-ordered genres (matches web's featured picks). Fall back to
      // the full alphabetical list if the RPC is unavailable (e.g. session not yet
      // attached), so the picker is never empty.
      let genreNames = (genreResult.data ?? []).map((g: any) => g.name);
      if (genreNames.length === 0) {
        const { data: allRows } = await supabase.from('tags').select('name').eq('type', 'genre').order('name');
        genreNames = (allRows ?? []).map((g: any) => g.name);
      }
      setAllGenres(genreNames);
    }
    load();
  }, []);

  function handleUsernameChange(val: string) {
    setUsername(val);
    setUsernameStatus('idle');
    if (usernameTimer.current) clearTimeout(usernameTimer.current);
    const normalized = normalizeUsername(val);
    if (normalized.length < USERNAME_MIN_LENGTH) return;
    if (!USERNAME_REGEX.test(normalized)) { setUsernameStatus('invalid'); return; }
    if (RESERVED_USERNAMES.has(normalized)) { setUsernameStatus('taken'); return; }
    usernameTimer.current = setTimeout(() => checkUsername(normalized), 400);
  }

  async function checkUsername(normalized: string) {
    setUsernameStatus('checking');
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', normalized)
      .neq('id', userId.current ?? '')
      .maybeSingle();
    setUsernameStatus(data ? 'taken' : 'available');
  }

  async function uploadAvatar(asset: ImagePicker.ImagePickerAsset) {
    setUploadingAvatar(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (!asset.base64) {
        Alert.alert('Upload failed', 'Could not read the selected photo.');
        return;
      }

      if ((asset.fileSize ?? asset.base64.length * 0.75) > 5 * 1024 * 1024) {
        Alert.alert('Photo too large', 'Profile photo must be under 5 MB.');
        return;
      }

      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${user.id}.${ext}`;
      const bytes = base64ToBytes(asset.base64);

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, bytes, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (uploadError) { Alert.alert('Upload failed', uploadError.message); return; }

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path);
      const nextUrl = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('profiles').update({ avatar_url: nextUrl }).eq('id', user.id);
      setAvatarUrl(nextUrl);
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function pickFromLibrary() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add a profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
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
      base64: true,
    });
    if (!result.canceled && result.assets[0]) await uploadAvatar(result.assets[0]);
  }

  function handleAvatarPress() {
    Alert.alert('Profile photo', undefined, [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickFromLibrary },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function toggleSinging(voice: string) {
    setSinging(prev => {
      const next = new Set(prev);
      next.delete('none');
      if (next.has(voice)) next.delete(voice);
      else next.add(voice);
      return next;
    });
  }

  // Picking a level is the same interaction as picking a confidence level on a
  // song, so it uses the same native sheet rather than a bespoke bottom sheet.
  function pickInstrumentLevel(name: string, event: GestureResponderEvent) {
    showOptionsSheet({
      title: name,
      anchor: anchorFrom(event),
      options: INSTRUMENT_LEVELS.map(level => ({
        label: level,
        onPress: () => addInstrument(name, level),
      })),
    });
  }

  function addInstrument(name: string, level: InstrumentLevel) {
    setInstruments(prev => ({ ...prev, [name]: level }));
  }

  function removeInstrument(name: string) {
    setInstruments(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }

  function toggleFavoriteGenre(genre: string) {
    setFavoriteGenres(prev =>
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  }

  async function handleSave() {
    setError(null);
    if (!firstName.trim()) { setError('First name is required.'); return; }
    const normalizedUsername = normalizeUsername(username);
    if (normalizedUsername.length < USERNAME_MIN_LENGTH) { setError('Username must be at least 3 characters.'); return; }
    if (!USERNAME_REGEX.test(normalizedUsername)) { setError('Username must be 3–20 characters: letters, numbers, and underscores only.'); return; }
    if (usernameStatus === 'taken' || usernameStatus === 'invalid') { setError('Please choose a valid username.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const fullName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
    const singingVoice = Array.from(singing);
    const neighborhoodValue = neighborhood.trim() || null;

    const [{ error: saveError }] = await Promise.all([
      supabase.from('profiles').upsert({
        id: user.id,
        display_name: firstName.trim(),
        last_name: lastName.trim() || null,
        username: normalizedUsername,
        singing_voice: singingVoice.join(',') || null,
        neighborhood: neighborhoodValue,
        instrument_levels: Object.keys(instruments).length > 0 ? instruments : null,
        favorite_genres: favoriteGenres.length > 0 ? favoriteGenres : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' }),
      supabase.auth.updateUser({ data: { name: fullName, full_name: fullName } }),
    ]);

    setSaving(false);
    if (saveError) { setError(saveError.message); return; }

    // Mirror web AccountPanel: the web API syncs the profile to ActiveCampaign
    // and sends the welcome email — this is the only trigger for it, so don't
    // drop the call.
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      fetch(`${WEB_URL}/api/account/sync-ac`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          firstName: firstName.trim() || undefined,
          lastName: lastName.trim() || undefined,
          neighborhood: neighborhoodValue || undefined,
          singingVoice,
          instrumentLevels: instruments,
          favoriteGenres,
        }),
      }).catch(() => {});
    }

    onSave();
  }

  const usernameHint = {
    idle: null,
    checking: 'Checking…',
    available: '✓ Available',
    taken: '✗ Already taken',
    invalid: 'Letters, numbers, and underscores only',
  }[usernameStatus];

  const usernameHintColor =
    usernameStatus === 'available' ? 'text-green-600' :
    usernameStatus === 'taken' || usernameStatus === 'invalid' ? 'text-red-500' :
    'text-zinc-400';

  const instrumentEntries = Object.entries(instruments);

  return (
    <>
      <LocationModal
        visible={locationModalVisible}
        initial={neighborhood}
        onClose={() => setLocationModalVisible(false)}
        onSelect={setNeighborhood}
      />

      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="px-6 pt-16 pb-10">
            <Text className="text-3xl font-bold text-zinc-900 mb-1">{title}</Text>
            <Text className="text-zinc-400 mb-8">{subtitle}</Text>

            {/* Profile photo */}
            <View className="flex-row items-center mb-6">
              <TouchableOpacity onPress={handleAvatarPress} className="relative">
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} className="h-16 w-16 rounded-full" />
                ) : (
                  <View className="h-16 w-16 items-center justify-center rounded-full bg-zinc-100">
                    <Text className="text-2xl text-zinc-400">
                      {firstName[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                )}
                {uploadingAvatar ? (
                  <View className="absolute inset-0 items-center justify-center rounded-full bg-black/40">
                    <ActivityIndicator color="white" size="small" />
                  </View>
                ) : (
                  <View className="absolute -bottom-0.5 -right-0.5 h-6 w-6 items-center justify-center rounded-full bg-amber-500 border-2 border-white">
                    <Ionicons name="camera" size={12} color="white" />
                  </View>
                )}
              </TouchableOpacity>
              <View className="ml-4 flex-1">
                <Text className="text-sm font-medium text-zinc-700">Profile photo</Text>
                <TouchableOpacity onPress={handleAvatarPress} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text className="text-sm text-amber-600 mt-0.5">
                    {avatarUrl ? 'Change photo' : 'Add a photo'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Name row */}
            <View className="flex-row mb-4">
              <View className="flex-1 mr-2">
                <Text className="text-sm font-medium text-zinc-700 mb-1">First name</Text>
                <TextInput
                  className="border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  placeholder="Jane"
                  value={firstName}
                  onChangeText={setFirstName}
                  autoCapitalize="words"
                />
              </View>
              <View className="flex-1 ml-2">
                <Text className="text-sm font-medium text-zinc-700 mb-1">Last name</Text>
                <TextInput
                  className="border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900"
                  placeholder="Smith"
                  value={lastName}
                  onChangeText={setLastName}
                  autoCapitalize="words"
                />
              </View>
            </View>

            {/* Username */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-zinc-700 mb-1">Username</Text>
              <View className="flex-row items-center border border-zinc-200 rounded-xl px-4 py-3">
                <Text className="text-zinc-400 mr-1">@</Text>
                <TextInput
                  className="flex-1 text-zinc-900"
                  placeholder="yourname"
                  value={username}
                  onChangeText={handleUsernameChange}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {usernameStatus === 'checking' && <ActivityIndicator size="small" color="#a1a1aa" />}
              </View>
              {usernameHint ? (
                <Text className={`text-xs mt-1 ${usernameHintColor}`}>{usernameHint}</Text>
              ) : null}
            </View>

            {/* Location */}
            <View className="mb-4">
              <Text className="text-sm font-medium text-zinc-700 mb-1">City</Text>
              <TouchableOpacity
                onPress={() => setLocationModalVisible(true)}
                className="border border-zinc-200 rounded-full px-4 py-3 flex-row items-center"
              >
                <Text className="text-zinc-400 mr-2">📍</Text>
                <Text className={`flex-1 ${neighborhood ? 'text-zinc-900' : 'text-zinc-400'}`}>
                  {neighborhood || 'City or neighborhood'}
                </Text>
                {neighborhood ? (
                  <TouchableOpacity
                    onPress={() => setNeighborhood('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text className="text-zinc-400">✕</Text>
                  </TouchableOpacity>
                ) : null}
              </TouchableOpacity>
            </View>

            {/* Singing voice */}
            <View className="mb-6">
              <Text className="text-sm font-medium text-zinc-700 mb-2">Singing</Text>
              <View className="flex-row mb-3">
                {(['lead', 'backup'] as const).map((voice, i) => {
                  const active = singing.has(voice);
                  return (
                    <TouchableOpacity
                      key={voice}
                      onPress={() => toggleSinging(voice)}
                      className={`flex-1 rounded-xl py-3 items-center border ${i === 0 ? 'mr-2' : 'ml-2'} ${
                        active ? 'bg-zinc-900 border-zinc-900' : 'bg-white border-zinc-200'
                      }`}
                    >
                      <Text className={`font-medium text-sm ${active ? 'text-white' : 'text-zinc-600'}`}>
                        {voice === 'lead' ? 'Lead vocals' : 'Backup vocals'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={() => setSinging(prev => (prev.has('none') ? new Set() : new Set(['none'])))}
                className={`rounded-xl py-3 items-center border ${
                  singing.has('none') ? 'bg-zinc-900 border-zinc-900' : 'bg-white border-zinc-200'
                }`}
              >
                <Text className={`font-medium text-sm ${singing.has('none') ? 'text-white' : 'text-zinc-600'}`}>
                  I don't sing
                </Text>
              </TouchableOpacity>
            </View>

            {/* Instruments */}
            <View className="mb-8">
              <Text className="text-sm font-medium text-zinc-700 mb-2">Instruments</Text>

              {/* You play */}
              {instrumentEntries.length > 0 && (
                <View className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 mb-3">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">You play</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {instrumentEntries
                      .sort(([aName, aLevel], [bName, bLevel]) => {
                        const order = [...INSTRUMENT_LEVELS].reverse();
                        const diff = order.indexOf(aLevel as InstrumentLevel) - order.indexOf(bLevel as InstrumentLevel);
                        return diff !== 0 ? diff : aName.localeCompare(bName);
                      })
                      .map(([name, level]) => (
                        <View key={name} className="flex-row items-center rounded-full border border-zinc-200 bg-zinc-100 pl-3 pr-1 py-1">
                          <TouchableOpacity
                            onPress={(e) => pickInstrumentLevel(name, e)}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            className="flex-row items-center"
                          >
                            <Text className="text-sm font-medium text-zinc-700 mr-1.5">{name}</Text>
                            <Text className="text-xs text-zinc-500">{level}</Text>
                            <Ionicons name="chevron-down" size={12} color="#a1a1aa" style={{ marginLeft: 2 }} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => removeInstrument(name)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            className="ml-1.5"
                          >
                            <Ionicons name="close-circle" size={16} color="#a1a1aa" />
                          </TouchableOpacity>
                        </View>
                      ))}
                  </View>
                </View>
              )}

              {/* Add an instrument */}
              <View className="rounded-xl border border-dashed border-zinc-300 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Add an instrument</Text>
                <InstrumentSearch added={instruments} onSelect={pickInstrumentLevel} />
              </View>
            </View>

            {/* Favorite genres */}
            <View className="mb-8">
              <Text className="text-sm font-medium text-zinc-700 mb-2">Favorite genres</Text>

              {favoriteGenres.length > 0 && (
                <View className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 mb-3">
                  <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Your genres</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {[...favoriteGenres].sort((a, b) => a.localeCompare(b)).map(g => (
                      <TouchableOpacity
                        key={g}
                        onPress={() => toggleFavoriteGenre(g)}
                        className="flex-row items-center rounded-full border border-zinc-200 bg-zinc-100 pl-3 pr-1 py-1"
                      >
                        <Text className="text-sm font-medium text-zinc-700 mr-1.5">{g}</Text>
                        <Ionicons name="close-circle" size={14} color="#a1a1aa" />
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <View className="rounded-xl border border-dashed border-zinc-300 p-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-2">Add a genre</Text>
                <GenreSearch
                  allGenres={allGenres}
                  selected={favoriteGenres}
                  topGenres={allGenres.filter(g => !favoriteGenres.includes(g)).slice(0, 10)}
                  onToggle={toggleFavoriteGenre}
                />
              </View>
            </View>

            {error ? <Text className="text-red-500 text-sm mb-3">{error}</Text> : null}

            <TouchableOpacity
              onPress={handleSave}
              disabled={saving}
              className="bg-zinc-900 rounded-xl py-4 items-center"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">{submitLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
