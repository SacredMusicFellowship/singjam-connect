import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, FlatList, Image, Alert,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useAddressTimezone } from '@/lib/useAddressTimezone';
import { zonedInputToIso, pickersToZonedInput, zoneAbbreviation, resolvePlaceAddress } from '@singjam/core';

const PLACES_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY ?? '';

type LookupItem = { id: string; name: string };
type PlaceSuggestion = { description: string; neighborhood: string; placeId: string };

const VISIBILITY_OPTIONS: { value: 'community' | 'private'; label: string; desc: string }[] = [
  { value: 'community', label: 'Community', desc: 'Open to all SingJam members' },
  { value: 'private', label: 'Private', desc: 'Invite-only, visible only to invitees' },
];

// ── Location modal ────────────────────────────────────────────────────────────

function LocationModal({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (address: string, neighborhood: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) { setQuery(''); setSuggestions([]); }
  }, [visible]);

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
        body: JSON.stringify({ input: q, languageCode: 'en' }),
      });
      const json = await res.json();
      setSuggestions(
        (json.suggestions ?? [])
          .filter((s: any) => s.placePrediction)
          .map((s: any) => ({
            description: s.placePrediction.text.text,
            neighborhood: s.placePrediction.structuredFormat?.mainText?.text ?? s.placePrediction.text.text,
            placeId: s.placePrediction.placeId,
          }))
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
          <Text className="flex-1 text-center font-semibold text-zinc-900">Location</Text>
          <View style={{ width: 54 }} />
        </View>
        <View className="px-4 py-3 border-b border-zinc-100">
          <View className="flex-row items-center bg-zinc-100 rounded-xl px-3 py-2">
            <Ionicons name="search" size={14} color="#a1a1aa" style={{ marginRight: 6 }} />
            <TextInput
              className="flex-1 text-zinc-900"
              placeholder="Search venue, address, or city…"
              placeholderTextColor="#a1a1aa"
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => { setQuery(''); setSuggestions([]); }}>
                <Ionicons name="close-circle" size={16} color="#a1a1aa" />
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
            keyExtractor={item => item.placeId}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={async () => {
                  onClose();
                  const address = await resolvePlaceAddress({
                    placeId: item.placeId,
                    mainText: item.neighborhood,
                    fallback: item.description,
                    apiKey: PLACES_KEY,
                  });
                  onSelect(address, item.neighborhood);
                }}
                className="px-4 py-3 border-b border-zinc-100"
              >
                <Text className="text-zinc-900" numberOfLines={2}>📍 {item.description}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              query.length >= 2 ? (
                <View className="items-center pt-12">
                  <Text className="text-zinc-400">No results</Text>
                </View>
              ) : null
            }
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Genre/Theme multi-select modal ────────────────────────────────────────────

function MultiSelectModal({
  visible,
  title,
  items,
  selected,
  onClose,
  onToggle,
}: {
  visible: boolean;
  title: string;
  items: LookupItem[];
  selected: string[];
  onClose: () => void;
  onToggle: (id: string) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-zinc-100">
          <View style={{ width: 48 }} />
          <Text className="flex-1 text-center font-semibold text-zinc-900">{title}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Done</Text>
          </TouchableOpacity>
        </View>
        <FlatList
          data={items}
          keyExtractor={item => item.id}
          renderItem={({ item }) => {
            const checked = selected.includes(item.id);
            return (
              <TouchableOpacity
                onPress={() => onToggle(item.id)}
                className={`px-4 py-3 border-b border-zinc-100 flex-row items-center justify-between ${checked ? 'bg-amber-50' : ''}`}
              >
                <Text className={`${checked ? 'text-amber-800 font-semibold' : 'text-zinc-900'}`}>{item.name}</Text>
                {checked && <Ionicons name="checkmark" size={16} color="#d97706" />}
              </TouchableOpacity>
            );
          }}
        />
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

function formatDateDisplay(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTimeDisplay(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function NewJamScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<'community' | 'private'>('community');
  const [capacity, setCapacity] = useState('');
  const [guestsCanInvite, setGuestsCanInvite] = useState(false);

  const [date, setDate] = useState<Date>((() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d; })());
  const [startTime, setStartTime] = useState<Date>((() => { const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0); return d; })());
  const [endTime, setEndTime] = useState<Date | null>(null);
  const [locationTbd, setLocationTbd] = useState(false);
  const [fullAddress, setFullAddress] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const { timezone, resolving: resolvingTimezone } = useAddressTimezone(locationTbd ? null : fullAddress, null, null);

  const [genres, setGenres] = useState<LookupItem[]>([]);
  const [themes, setThemes] = useState<LookupItem[]>([]);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);

  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [startPickerVisible, setStartPickerVisible] = useState(false);
  const [endPickerVisible, setEndPickerVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [genreModalVisible, setGenreModalVisible] = useState(false);
  const [themeModalVisible, setThemeModalVisible] = useState(false);

  const [coverAsset, setCoverAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [{ data: g }, { data: t }] = await Promise.all([
        supabase.from('genres').select('id, name').order('name'),
        supabase.from('themes').select('id, name').order('name'),
      ]);
      setGenres((g as LookupItem[]) ?? []);
      setThemes((t as LookupItem[]) ?? []);
    }
    load();
  }, []);

  function toggleGenre(id: string) {
    setSelectedGenres(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  function toggleTheme(id: string) {
    setSelectedThemes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  // The pickers hold the venue's wall clock; read it in the venue's zone.
  function buildStartsAt(): string | null {
    return zonedInputToIso(pickersToZonedInput(date, startTime), timezone);
  }

  function buildEndsAt(): string | null {
    if (!endTime) return null;
    return zonedInputToIso(pickersToZonedInput(date, endTime), timezone);
  }

  async function handleCreate() {
    setError(null);
    if (!locationTbd && !fullAddress) { setError('Add a location or mark it as TBD.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, username')
      .eq('id', user.id)
      .single();

    const displayName = (profile as any)?.display_name ?? (profile as any)?.username ?? null;
    const defaultName = displayName ? `${displayName}'s jam` : 'Community jam';

    const { data, error: insertError } = await supabase.from('jams').insert({
      host_user_id: user.id,
      name: name.trim() || defaultName,
      starts_at: buildStartsAt(),
      ends_at: buildEndsAt(),
      neighborhood: locationTbd ? 'TBD' : (neighborhood || fullAddress || null),
      full_address: locationTbd ? null : (fullAddress || null),
      notes: description.trim() || null,
      visibility,
      guests_can_invite: guestsCanInvite,
      capacity: capacity ? parseInt(capacity, 10) : null,
      timezone,
      created_at: new Date().toISOString(),
    }).select('id').single();

    setSaving(false);

    if (insertError || !data?.id) { setError(insertError?.message ?? 'Something went wrong.'); return; }

    const jamId = data.id;

    await Promise.all([
      selectedGenres.length > 0
        ? supabase.from('jam_genres').insert(selectedGenres.map(genre_id => ({ jam_id: jamId, genre_id })))
        : Promise.resolve(),
      selectedThemes.length > 0
        ? supabase.from('jam_themes').insert(selectedThemes.map(theme_id => ({ jam_id: jamId, theme_id })))
        : Promise.resolve(),
    ]);

    if (coverAsset) {
      const ext = coverAsset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${jamId}.${ext}`;
      const response = await fetch(coverAsset.uri);
      const blob = await response.blob();
      const { error: uploadError } = await supabase.storage
        .from('jam-images')
        .upload(path, blob, { contentType: coverAsset.mimeType ?? 'image/jpeg', upsert: true });
      if (!uploadError) {
        const { data: { publicUrl } } = supabase.storage.from('jam-images').getPublicUrl(path);
        await supabase.from('jams').update({ image_url: publicUrl }).eq('id', jamId);
      }
    }

    router.replace({ pathname: '/jam/[id]' as any, params: { id: jamId } });
  }

  async function pickCoverImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to add a cover image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setCoverAsset(result.assets[0]);
  }

  const selectedGenreNames = selectedGenres.map(id => genres.find(g => g.id === id)?.name).filter(Boolean).join(', ');
  const selectedThemeNames = selectedThemes.map(id => themes.find(t => t.id === id)?.name).filter(Boolean).join(', ');

  return (
    <>
      <Stack.Screen options={{ title: 'New Jam', headerTintColor: '#d97706', presentation: 'modal' }} />

      <LocationModal
        visible={locationModalVisible}
        onClose={() => setLocationModalVisible(false)}
        onSelect={(addr, nbhd) => { setFullAddress(addr); setNeighborhood(nbhd); }}
      />
      <MultiSelectModal
        visible={genreModalVisible}
        title="Genres"
        items={genres}
        selected={selectedGenres}
        onClose={() => setGenreModalVisible(false)}
        onToggle={toggleGenre}
      />
      <MultiSelectModal
        visible={themeModalVisible}
        title="Themes"
        items={themes}
        selected={selectedThemes}
        onClose={() => setThemeModalVisible(false)}
        onToggle={toggleTheme}
      />

      {/* iOS date/time pickers (shown inline on iOS) */}
      {datePickerVisible && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setDatePickerVisible(false)}>
          <View className="flex-1 bg-black/40 justify-end">
            <View className="bg-white pb-6">
              <View className="flex-row justify-end px-4 pt-3 pb-1">
                <TouchableOpacity onPress={() => setDatePickerVisible(false)}>
                  <Text className="text-amber-600 font-semibold text-base">Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={date}
                mode="date"
                display="spinner"
                onChange={(_, d) => { if (d) setDate(d); }}
                minimumDate={new Date()}
              />
            </View>
          </View>
        </Modal>
      )}

      {startPickerVisible && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setStartPickerVisible(false)}>
          <View className="flex-1 bg-black/40 justify-end">
            <View className="bg-white pb-6">
              <View className="flex-row justify-end px-4 pt-3 pb-1">
                <TouchableOpacity onPress={() => setStartPickerVisible(false)}>
                  <Text className="text-amber-600 font-semibold text-base">Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={startTime}
                mode="time"
                display="spinner"
                onChange={(_, d) => { if (d) setStartTime(d); }}
                minuteInterval={5}
              />
            </View>
          </View>
        </Modal>
      )}

      {endPickerVisible && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setEndPickerVisible(false)}>
          <View className="flex-1 bg-black/40 justify-end">
            <View className="bg-white pb-6">
              <View className="flex-row items-center justify-between px-4 pt-3 pb-1">
                <TouchableOpacity onPress={() => { setEndTime(null); setEndPickerVisible(false); }}>
                  <Text className="text-zinc-400 font-medium">Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setEndPickerVisible(false)}>
                  <Text className="text-amber-600 font-semibold text-base">Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={endTime ?? startTime}
                mode="time"
                display="spinner"
                onChange={(_, d) => { if (d) setEndTime(d); }}
                minuteInterval={5}
              />
            </View>
          </View>
        </Modal>
      )}

      <KeyboardAvoidingView
        className="flex-1 bg-slate-50"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
          <View className="px-4 pt-4 pb-16">

            {/* Cover image */}
            <TouchableOpacity
              onPress={pickCoverImage}
              className="bg-white rounded-xl border border-zinc-100 overflow-hidden mb-4"
            >
              {coverAsset ? (
                <View>
                  <Image source={{ uri: coverAsset.uri }} style={{ width: '100%', height: 160 }} resizeMode="cover" />
                  <View className="absolute bottom-2 right-2 bg-black/50 rounded-full px-3 py-1">
                    <Text className="text-white text-xs font-medium">Change</Text>
                  </View>
                </View>
              ) : (
                <View className="items-center justify-center py-8 gap-1">
                  <Ionicons name="image-outline" size={28} color="#a1a1aa" />
                  <Text className="text-zinc-400 text-sm mt-1">Add cover image (optional)</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* Name */}
            <View className="bg-white rounded-xl border border-zinc-100 overflow-hidden mb-4">
              <View className="px-4 py-3 border-b border-zinc-100">
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Name</Text>
                <TextInput
                  className="text-zinc-900 text-base"
                  placeholder="Leave blank for auto-name"
                  placeholderTextColor="#a1a1aa"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="sentences"
                />
              </View>

              {/* Description */}
              <View className="px-4 py-3">
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Notes (optional)</Text>
                <TextInput
                  className="text-zinc-900"
                  placeholder="What to bring, parking info, song suggestions…"
                  placeholderTextColor="#a1a1aa"
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 60, textAlignVertical: 'top' }}
                  autoCapitalize="sentences"
                />
              </View>
            </View>

            {/* Date & Time */}
            <View className="bg-white rounded-xl border border-zinc-100 overflow-hidden mb-4">
              <TouchableOpacity
                onPress={() => setDatePickerVisible(true)}
                className="px-4 py-3 border-b border-zinc-100 flex-row items-center justify-between"
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Date</Text>
                <Text className="text-zinc-900 font-medium">{formatDateDisplay(date)}</Text>
              </TouchableOpacity>

              <View className="flex-row">
                <TouchableOpacity
                  onPress={() => setStartPickerVisible(true)}
                  className="flex-1 px-4 py-3 border-r border-zinc-100 flex-row items-center justify-between"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Start</Text>
                  <Text className="text-zinc-900 font-medium">{formatTimeDisplay(startTime)}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setEndPickerVisible(true)}
                  className="flex-1 px-4 py-3 flex-row items-center justify-between"
                >
                  <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">End</Text>
                  <Text className={`font-medium ${endTime ? 'text-zinc-900' : 'text-zinc-400'}`}>
                    {endTime ? formatTimeDisplay(endTime) : 'Optional'}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text className="px-4 pb-3 text-xs text-zinc-400">
                {resolvingTimezone
                  ? "Checking the venue's time zone…"
                  : `Times are in ${zoneAbbreviation(timezone, new Date(buildStartsAt() ?? Date.now()))}`}
              </Text>
            </View>

            {/* Location */}
            <View className="bg-white rounded-xl border border-zinc-100 overflow-hidden mb-4">
              <TouchableOpacity
                onPress={() => { if (!locationTbd) setLocationModalVisible(true); }}
                className="px-4 py-3 border-b border-zinc-100 flex-row items-center justify-between"
                disabled={locationTbd}
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Location</Text>
                <Text className={`font-medium flex-1 text-right ml-4 ${fullAddress && !locationTbd ? 'text-zinc-900' : 'text-zinc-400'}`} numberOfLines={1}>
                  {locationTbd ? 'TBD' : (fullAddress || 'Tap to search')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => { setLocationTbd(!locationTbd); if (!locationTbd) { setFullAddress(''); setNeighborhood(''); } }}
                className="px-4 py-3 flex-row items-center gap-3"
              >
                <View className={`w-5 h-5 rounded border-2 items-center justify-center ${locationTbd ? 'bg-amber-500 border-amber-500' : 'border-zinc-300'}`}>
                  {locationTbd && <Ionicons name="checkmark" size={12} color="white" />}
                </View>
                <Text className="text-zinc-700 text-sm">Location TBD</Text>
              </TouchableOpacity>
            </View>

            {/* Visibility & Settings */}
            <View className="bg-white rounded-xl border border-zinc-100 overflow-hidden mb-4">
              <View className="px-4 py-3 border-b border-zinc-100">
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Visibility</Text>
                <View className="flex-row gap-2">
                  {VISIBILITY_OPTIONS.map(opt => (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setVisibility(opt.value)}
                      className={`flex-1 rounded-xl py-2.5 items-center border ${visibility === opt.value ? 'bg-amber-500 border-amber-500' : 'bg-white border-zinc-200'}`}
                    >
                      <Text className={`text-sm font-semibold ${visibility === opt.value ? 'text-white' : 'text-zinc-600'}`}>{opt.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View className="px-4 py-3 border-b border-zinc-100">
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-1.5">Capacity (optional)</Text>
                <TextInput
                  className="text-zinc-900"
                  placeholder="No limit"
                  placeholderTextColor="#a1a1aa"
                  value={capacity}
                  onChangeText={setCapacity}
                  keyboardType="number-pad"
                />
              </View>

              <TouchableOpacity
                onPress={() => setGuestsCanInvite(!guestsCanInvite)}
                className="px-4 py-3 flex-row items-center gap-3"
              >
                <View className={`w-5 h-5 rounded border-2 items-center justify-center ${guestsCanInvite ? 'bg-amber-500 border-amber-500' : 'border-zinc-300'}`}>
                  {guestsCanInvite && <Ionicons name="checkmark" size={12} color="white" />}
                </View>
                <View className="flex-1">
                  <Text className="text-zinc-900 font-medium">Guests can invite</Text>
                  <Text className="text-xs text-zinc-400">Attendees can invite other members</Text>
                </View>
              </TouchableOpacity>
            </View>

            {/* Genres & Themes */}
            <View className="bg-white rounded-xl border border-zinc-100 overflow-hidden mb-6">
              <TouchableOpacity
                onPress={() => setGenreModalVisible(true)}
                className="px-4 py-3 border-b border-zinc-100 flex-row items-center justify-between"
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Genres</Text>
                <Text className={`font-medium flex-1 text-right ml-4 ${selectedGenreNames ? 'text-zinc-900' : 'text-zinc-400'}`} numberOfLines={1}>
                  {selectedGenreNames || 'None selected'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setThemeModalVisible(true)}
                className="px-4 py-3 flex-row items-center justify-between"
              >
                <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Themes</Text>
                <Text className={`font-medium flex-1 text-right ml-4 ${selectedThemeNames ? 'text-zinc-900' : 'text-zinc-400'}`} numberOfLines={1}>
                  {selectedThemeNames || 'None selected'}
                </Text>
              </TouchableOpacity>
            </View>

            {error ? (
              <View className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                <Text className="text-red-600 text-sm">{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleCreate}
              disabled={saving || resolvingTimezone}
              className={`bg-amber-500 rounded-xl py-4 items-center ${resolvingTimezone ? 'opacity-50' : ''}`}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-white font-semibold text-base">Create jam</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </>
  );
}
