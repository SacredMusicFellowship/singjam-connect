import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Modal, FlatList, TextInput,
  KeyboardAvoidingView, Platform, Linking, useWindowDimensions,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { WIDE_BREAKPOINT } from '@/components/BrandHeader';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { noteMySong } from '@/lib/mySongsStore';
import { supabase } from '@/lib/supabase';
import { setApi } from '@/lib/setApi';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import { canRemoveSetSong, CONFIDENCE_STYLES, createLatestWinsQueue, fetchAllRows, formatComposers, KEY_STYLE, PEOPLE_ROW_LIMIT, prioritizePeople, SET_ROLE_DESCRIPTIONS, reorderSongsForPlayed, SET_SONG_NOTE_MAX, shownPeopleCount, songSubtitle } from '@singjam/core';
import SubtitleText from '@/components/SubtitleText';
import ContentContainer from '@/components/ContentContainer';
import PromptCard from '@/components/PromptCard';
import KeyPicker from '@/components/KeyPicker';
import UgBackTip from '@/components/UgBackTip';
import { ensureLeadVoice } from '@/lib/leadVoice';
import RolePill from '@/components/RolePill';
import SongRowTitle, { type SongRowCard } from '@/components/SongRowTitle';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

type SetSortOrder = 'custom' | 'title_asc' | 'title_desc';


type SetData = {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string;
  link_sharing: 'private' | 'link' | 'public';
  spotify_playlist_id: string | null;
  profiles: { display_name: string | null; last_name: string | null; username: string | null } | null;
};

// Owner + accepted collaborators, used to render per-song Lead/Support pills.
type Participant = {
  user_id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
};

function participantLabel(p: Participant): string {
  const first = p.display_name ?? p.username ?? '?';
  return p.last_name ? `${first} ${p.last_name[0].toUpperCase()}.` : first;
}

type SetSong = {
  id: string;
  song_id: string;
  position: number;
  key_note: string | null;
  notes: string | null;
  played: boolean;
  leader_user_ids: string[];
  added_by_user_id?: string | null;
  songs: {
    title: string;
    display_artist: string | null;
    byline?: string | null;
    chord_chart_url: string | null;
    tonality?: string | null;
    song_composers: { people: { name: string } | null }[];
    song_productions?: { productions: { name: string } | null }[];
  };
};

type SongSearchResult = SongRowCard & {
  song_id: string;
  title: string;
  display_artist: string | null;
  productions: string[];
};

function AddSongModal({
  visible,
  existingIds,
  userId,
  singingVoice,
  onVoiceUpgraded,
  onClose,
  onAdded,
}: {
  visible: boolean;
  existingIds: Set<string>;
  userId: string | null;
  singingVoice: string | null;
  onVoiceUpgraded: (voice: string) => void;
  onClose: () => void;
  onAdded: (song: SetSong) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { id: setId } = useLocalSearchParams<{ id: string }>();

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timer = setTimeout(() => search(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  async function search(q: string) {
    setSearching(true);
    const { data } = await supabase.rpc('search_songs', { q, limit_n: 30 });
    setResults((data ?? []) as SongSearchResult[]);
    setSearching(false);
  }

  // As on web, a song that isn't in your songs yet asks your part first and joins your songs at that part.
  function askPart(title: string): Promise<string | null> {
    return new Promise((resolve) => {
      Alert.alert("What's your part?", `"${title}" will be added to your songs.`, [
        { text: 'Lead', onPress: () => resolve('lead') },
        { text: 'Support', onPress: () => resolve('support') },
        { text: 'Learn', onPress: () => resolve('learn') },
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      ], { cancelable: true, onDismiss: () => resolve(null) });
    });
  }

  async function addSong(song: SongSearchResult) {
    setPendingId(song.song_id);
    const { data: mine } = userId
      ? await supabase.from('user_songs').select('confidence').eq('user_id', userId).eq('song_id', song.song_id).maybeSingle()
      : { data: null };
    let confidence: string | null = null;
    if (!mine) {
      confidence = await askPart(song.title);
      if (!confidence || !(await ensureLeadVoice(confidence, singingVoice, userId, onVoiceUpgraded))) {
        setPendingId(null);
        return;
      }
    }
    const { ok, json } = await setApi(`/api/sets/${setId}/songs`, 'POST', confidence ? { songId: song.song_id, confidence } : { songId: song.song_id });
    setPendingId(null);
    if (!ok) { Alert.alert('Error', json?.error ?? 'Could not add song.'); return; }
    onAdded(json.song as SetSong);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-row items-center px-4 pt-4 pb-2 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Done</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900">Add Song</Text>
          <View style={{ width: 50 }} />
        </View>

        <View className="px-4 py-3 border-b border-zinc-100">
          <View className="flex-row items-center bg-zinc-100 rounded-xl px-3 py-2">
            <Text className="text-zinc-400 mr-2">🔍</Text>
            <TextInput
              className="flex-1 text-zinc-900"
              placeholder="Search by title or artist…"
              placeholderTextColor="#a1a1aa"
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Text className="text-zinc-400 ml-2">✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {searching ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#d97706" />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(item) => item.song_id}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const already = existingIds.has(item.song_id);
              const pending = pendingId === item.song_id;
              return (
                <View className="flex-row items-center px-4 py-3 border-b border-zinc-100">
                  <View className="flex-1 mr-3">
                    <SongRowTitle title={item.title} displayArtist={item.display_artist} productions={item.productions} card={item} />
                  </View>
                  {already ? (
                    <Text className="text-zinc-400 text-sm">Added</Text>
                  ) : pending ? (
                    <ActivityIndicator size="small" color="#d97706" />
                  ) : (
                    <TouchableOpacity
                      onPress={() => addSong(item)}
                      className="bg-amber-500 rounded-full px-3 py-1"
                    >
                      <Text className="text-white text-sm font-medium">Add</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
            ListEmptyComponent={
              query.length > 0 ? (
                <Text className="text-center text-zinc-400 mt-12">No songs found</Text>
              ) : null
            }
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SongRow({
  song,
  canManage,
  canRemove,
  myUserId,
  displayPosition,
  drag,
  isActive,
  participants,
  participantKnowledge,
  participantKeys,
  hasEligible,
  isPublicViewer,
  myConfidence,
  onSetMyConfidence,
  onRemove,
  onKeyChange,
  onNotesChange,
  onLeaderToggle,
  onTogglePlayed,
}: {
  song: SetSong;
  /** Owner or co-owner: reorder, remove, key, played, notes, choosing leaders. */
  canManage: boolean;
  canRemove: boolean;
  myUserId: string | null;
  displayPosition: number;
  drag?: () => void;
  isActive?: boolean;
  participants: Participant[];
  participantKnowledge: Map<string, string>;
  participantKeys: Map<string, string>;
  hasEligible: boolean;
  isPublicViewer: boolean;
  /** The viewer's own role for this song, if it's in their repertoire. */
  myConfidence: string | null;
  onSetMyConfidence: (level: string) => void;
  onRemove: () => void;
  onKeyChange: (key: string | null) => void;
  onNotesChange: (notes: string | null) => void;
  onLeaderToggle: (newLeaderIds: string[]) => void;
  onTogglePlayed: () => void;
}) {
  const [keyPickerVisible, setKeyPickerVisible] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const composerNames = (song.songs.song_composers ?? [])
    .map((sc) => sc.people?.name)
    .filter(Boolean) as string[];
  const artist = song.songs.byline ?? song.songs.display_artist ?? formatComposers(composerNames, []);
  const productions = (song.songs.song_productions ?? [])
    .map((sp) => sp.productions?.name)
    .filter(Boolean) as string[];

  // Leader/support assignments are only shown to collaborators; public viewers
  // see none. Mirrors web SetSongRow.
  const leaderIds = song.leader_user_ids ?? [];
  const visibleParticipants = isPublicViewer ? [] : participants;
  const leadParticipants = visibleParticipants.filter(
    (p) => leaderIds.includes(p.user_id) || participantKnowledge.get(p.user_id) === 'lead'
  );
  const supportParticipants = visibleParticipants.filter(
    (p) => !leaderIds.includes(p.user_id) && participantKnowledge.get(p.user_id) === 'support'
  );
  // As on web: who's learning the song, so leaders see who might want help.
  const learnParticipants = visibleParticipants.filter(
    (p) => !leaderIds.includes(p.user_id) && participantKnowledge.get(p.user_id) === 'learn'
  );
  const showLeaderBlock =
    !isPublicViewer &&
    (leadParticipants.length > 0 || supportParticipants.length > 0 || learnParticipants.length > 0 || (canManage && participants.length > 0));

  // Set when Cancel closes the editor, so the input's blur doesn't save.
  const discardNotesRef = useRef(false);

  function startEditingNotes() {
    discardNotesRef.current = false;
    setNotesInput(song.notes ?? '');
    setEditingNotes(true);
  }

  function saveNotes(value: string = notesInput) {
    if (discardNotesRef.current) return;
    discardNotesRef.current = true;
    setEditingNotes(false);
    const next = value.trim() || null;
    if (next !== song.notes) onNotesChange(next);
  }

  function cancelNotes() {
    discardNotesRef.current = true;
    setEditingNotes(false);
  }

  function confirmRemove() {
    Alert.alert(
      'Remove Song',
      `Remove "${song.songs.title}" from this set?`,
      [
        { text: 'Remove', style: 'destructive', onPress: onRemove },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  const showPlayed = canManage || song.played;
  const showFooter = !!myConfidence || showPlayed || canManage || canRemove;
  // Removing their own song is the only action a guest has, so it gets a direct button instead of a ⋯ menu.
  const guestRemove = canRemove && !canManage;
  const wide = useWindowDimensions().width >= WIDE_BREAKPOINT;

  // Same items as web's ⋯ menu, which only the owner and co-owners get.
  function openMenu(event: GestureResponderEvent) {
    showOptionsSheet({
      title: song.songs.title,
      anchor: anchorFrom(event),
      options: [
        ...(!song.notes ? [{ label: 'Add note', onPress: startEditingNotes }] : []),
        { label: 'Remove from set', destructive: true, onPress: confirmRemove },
      ],
    });
  }

  function openRolePicker(event: GestureResponderEvent) {
    showOptionsSheet({
      title: song.songs.title,
      anchor: anchorFrom(event),
      options: [
        { label: 'Lead', onPress: () => onSetMyConfidence('lead') },
        { label: 'Support', onPress: () => onSetMyConfidence('support') },
        { label: 'Learn', onPress: () => onSetMyConfidence('learn') },
      ],
    });
  }

  // "I know this song!" asks lead or support; learning has its own button, as on web.
  function openKnowPicker(event: GestureResponderEvent) {
    showOptionsSheet({
      title: `Add "${song.songs.title}" as…`,
      anchor: anchorFrom(event),
      options: [
        { label: 'Lead', onPress: () => onSetMyConfidence('lead') },
        { label: 'Support', onPress: () => onSetMyConfidence('support') },
      ],
    });
  }

  // As on web: each row keeps to one line, "+ N more" opens the rest, and only
  // a cut-short row is reordered (chosen leaders, then you, first).
  const trimRow = <T extends { user_id: string }>(list: T[], first: (string | null)[]) =>
    showAllPeople || list.length <= PEOPLE_ROW_LIMIT.phone
      ? list
      : prioritizePeople(list, first).slice(0, shownPeopleCount(list.length, PEOPLE_ROW_LIMIT.phone));
  const moreToggle = (count: number) => {
    const hidden = count - shownPeopleCount(count, PEOPLE_ROW_LIMIT.phone);
    if (hidden === 0) return null;
    return (
      <TouchableOpacity
        onPress={() => setShowAllPeople((v) => !v)}
        className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 mr-1 mb-1"
      >
        <Text className="text-xs text-zinc-500">{showAllPeople ? 'Show less' : `+${hidden} more`}</Text>
      </TouchableOpacity>
    );
  };

  const nameWeight = (userId: string) => (userId === myUserId ? 'font-bold' : 'font-medium');

  return (
    <>
      <KeyPicker
        visible={keyPickerVisible}
        current={song.key_note}
        onClose={() => setKeyPickerVisible(false)}
        onSelect={onKeyChange}
      />
      <View className={`flex-row px-4 py-3 border-b border-zinc-100 ${isActive ? 'bg-amber-50' : song.played ? 'bg-zinc-50' : 'bg-white'}`}>
        <View className="w-7 items-center mr-2 pt-0.5">
          <Text className="text-zinc-300 text-xs font-semibold">{displayPosition}</Text>
          {canManage && drag ? (
            <TouchableOpacity
              onLongPress={drag}
              delayLongPress={150}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="mt-1"
              accessibilityLabel="Drag to reorder"
            >
              <Ionicons name="reorder-three-outline" size={20} color="#a1a1aa" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View className="flex-1 min-w-0">
          <View className="flex-row items-start">
            <View className="flex-1 min-w-0">
              <Text className="text-zinc-900 font-medium" numberOfLines={2}>{song.songs.title}</Text>
              <View className="flex-row items-center mt-0.5">
                {songSubtitle(productions, artist) && (
                  <Text className="text-zinc-500 text-sm flex-shrink mr-3" numberOfLines={1}>
                    <SubtitleText productions={productions} artist={artist} />
                  </Text>
                )}
                {canManage ? (
                  <TouchableOpacity
                    onPress={() => setKeyPickerVisible(true)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    className={`rounded-full px-2 py-0.5 mr-1 ${song.key_note ? KEY_STYLE.chip : KEY_STYLE.emptyChip}`}
                    // Wide enough for a two-character key, so C and C# chips match.
                    style={{ minWidth: 34, alignItems: 'center' }}
                    accessibilityLabel="Key"
                  >
                    <Text className={`text-xs font-semibold ${song.key_note ? KEY_STYLE.text : KEY_STYLE.emptyText}`}>
                      {song.key_note ?? '+ key'}
                    </Text>
                  </TouchableOpacity>
                ) : !isPublicViewer && song.key_note ? (
                  <View className={`rounded-full px-2 py-0.5 mr-1 items-center ${KEY_STYLE.chip}`} style={{ minWidth: 34 }}>
                    <Text className={`text-xs font-semibold ${KEY_STYLE.text}`}>{song.key_note}</Text>
                  </View>
                ) : null}
                {!isPublicViewer && song.songs.tonality ? (
                  <Text className="text-xs text-zinc-500">{song.songs.tonality}</Text>
                ) : null}
              </View>
            </View>
            {song.songs.chord_chart_url ? (
              <TouchableOpacity
                onPress={() => Linking.openURL(song.songs.chord_chart_url!).catch(() => Alert.alert('Could not open link'))}
                className="ml-2 flex-row items-center gap-1 px-2.5 py-1 rounded-full border border-zinc-200 bg-white"
                accessibilityLabel="Chord chart"
              >
                <Text className="text-xs font-medium text-zinc-600">Chords</Text>
                <Ionicons name="open-outline" size={11} color="#a1a1aa" />
              </TouchableOpacity>
            ) : null}
          </View>

          {editingNotes ? (
          <View className="mt-2">
            <TextInput
              value={notesInput}
              onChangeText={setNotesInput}
              onBlur={() => saveNotes()}
              onSubmitEditing={() => saveNotes()}
              maxLength={SET_SONG_NOTE_MAX}
              placeholder="e.g. Capo 3, start soft"
              placeholderTextColor="#a1a1aa"
              returnKeyType="done"
              autoFocus
              className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-900"
            />
            <View className="flex-row items-center gap-3 mt-2">
              <TouchableOpacity onPress={() => saveNotes()} className="rounded-full bg-amber-500 px-3 py-1.5">
                <Text className="text-xs font-semibold text-white">Save</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={cancelNotes} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                <Text className="text-xs text-zinc-500">Cancel</Text>
              </TouchableOpacity>
              {song.notes ? (
                <TouchableOpacity onPress={() => saveNotes('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                  <Text className="text-xs text-zinc-400">Remove note</Text>
                </TouchableOpacity>
              ) : null}
              <Text className="ml-auto text-[10px] text-zinc-400">{notesInput.length}/{SET_SONG_NOTE_MAX}</Text>
            </View>
          </View>
        ) : !isPublicViewer && song.notes ? (
          <View className="mt-2 flex-row items-start rounded-lg bg-zinc-50 px-2.5 py-1.5">
            <Ionicons name="document-text-outline" size={14} color="#a1a1aa" style={{ marginTop: 1, marginRight: 6 }} />
            <Text className="flex-1 text-sm text-zinc-700">{song.notes}</Text>
            {canManage ? (
              <TouchableOpacity onPress={startEditingNotes} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="ml-2">
                <Text className="text-xs font-medium text-amber-600">Edit</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          ) : null}

          {!myConfidence ? (
            <View className="flex-row flex-wrap items-center gap-2 mt-2">
              <TouchableOpacity onPress={openKnowPicker} className="rounded-full bg-indigo-500 px-3 py-1.5">
                <Text className="text-white text-xs font-medium">I know this song!</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onSetMyConfidence('learn')} className="rounded-full border border-indigo-200 bg-white px-3 py-1.5">
                <Text className="text-indigo-600 text-xs font-medium">Want to learn it</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {showLeaderBlock ? (
            <View className="mt-2 gap-1">
              {(leadParticipants.length > 0 || (canManage && participants.length > 0)) ? (
                <View className="flex-row items-start">
                  <Text className={`text-[10px] font-medium mr-1.5 mt-1 ${CONFIDENCE_STYLES.lead.label}`}>Lead</Text>
                  <View className="flex-row flex-wrap flex-1">
                    {canManage && leaderIds.length === 0 && !hasEligible ? (
                      <View className="rounded-full border border-dashed border-amber-300 px-2 py-0.5 mr-1 mb-1">
                        <Text className="text-amber-500 text-xs font-medium">No leader</Text>
                      </View>
                    ) : null}
                    {trimRow(leadParticipants, [...leaderIds, myUserId]).map((p) => {
                      const isLeader = leaderIds.includes(p.user_id);
                      // As on web: anyone who has joined can put themselves forward; choosing
                      // someone else is for the owner and co-owners.
                      const clickable = participantKnowledge.get(p.user_id) === 'lead' && (canManage || p.user_id === myUserId);
                      return (
                        <TouchableOpacity
                          key={p.user_id}
                          disabled={!clickable}
                          onPress={() => {
                            const next = isLeader
                              ? leaderIds.filter((uid) => uid !== p.user_id)
                              : [...leaderIds, p.user_id];
                            onLeaderToggle(next);
                          }}
                          className={`rounded-full px-2 py-0.5 mr-1 mb-1 ${isLeader ? 'bg-amber-400' : CONFIDENCE_STYLES.lead.pill}`}
                        >
                          <Text className={`text-xs ${nameWeight(p.user_id)} ${isLeader ? 'text-white' : CONFIDENCE_STYLES.lead.pillText}`}>
                            {participantLabel(p)}
                            {participantKeys.get(p.user_id) ? ` (${participantKeys.get(p.user_id)})` : null}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {moreToggle(leadParticipants.length)}
                  </View>
                </View>
              ) : null}
              {supportParticipants.length > 0 ? (
                <View className="flex-row items-start">
                  <Text className={`text-[10px] font-medium mr-1.5 mt-1 ${CONFIDENCE_STYLES.support.label}`}>Support</Text>
                  <View className="flex-row flex-wrap flex-1">
                    {trimRow(supportParticipants, [myUserId]).map((p) => (
                      <View key={p.user_id} className={`rounded-full px-2 py-0.5 mr-1 mb-1 ${CONFIDENCE_STYLES.support.pill}`}>
                        <Text className={`text-xs ${CONFIDENCE_STYLES.support.pillText} ${nameWeight(p.user_id)}`}>{participantLabel(p)}</Text>
                      </View>
                    ))}
                    {moreToggle(supportParticipants.length)}
                  </View>
                </View>
              ) : null}
              {learnParticipants.length > 0 ? (
                <View className="flex-row items-start">
                  <Text className={`text-[10px] font-medium mr-1.5 mt-1 ${CONFIDENCE_STYLES.learn.label}`}>Learning</Text>
                  <View className="flex-row flex-wrap flex-1">
                    {trimRow(learnParticipants, [myUserId]).map((p) => (
                      <View key={p.user_id} className={`rounded-full px-2 py-0.5 mr-1 mb-1 ${CONFIDENCE_STYLES.learn.pill}`}>
                        <Text className={`text-xs ${CONFIDENCE_STYLES.learn.pillText} ${nameWeight(p.user_id)}`}>{participantLabel(p)}</Text>
                      </View>
                    ))}
                    {moreToggle(learnParticipants.length)}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {showFooter ? (
            <View className="flex-row items-center mt-2">
              <View className="flex-1 flex-row flex-wrap items-center gap-2">
                {myConfidence ? <RolePill level={myConfidence} onPress={openRolePicker} /> : null}
                {canManage ? (
                  <TouchableOpacity
                    onPress={onTogglePlayed}
                    className={`flex-row items-center rounded-full px-2.5 py-1 ${song.played ? 'bg-green-500' : 'border border-zinc-200 bg-white'}`}
                  >
                    {song.played ? <Ionicons name="checkmark" size={12} color="#fff" style={{ marginRight: 3 }} /> : null}
                    <Text className={`text-xs font-medium ${song.played ? 'text-white' : 'text-zinc-500'}`}>
                      {song.played ? 'Played' : 'Mark as played'}
                    </Text>
                  </TouchableOpacity>
                ) : song.played ? (
                  <View className="flex-row items-center rounded-full bg-green-500 px-2.5 py-1">
                    <Ionicons name="checkmark" size={12} color="#fff" style={{ marginRight: 3 }} />
                    <Text className="text-xs font-medium text-white">Played</Text>
                  </View>
                ) : null}
              </View>
              {canManage ? (
                <TouchableOpacity onPress={openMenu} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="More options">
                  <Ionicons name="ellipsis-horizontal" size={20} color="#a1a1aa" />
                </TouchableOpacity>
              ) : guestRemove ? (
                wide ? (
                  <TouchableOpacity onPress={confirmRemove} className="rounded-full border border-zinc-200 px-2 py-1">
                    <Text className="text-xs text-zinc-400">Remove</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity onPress={confirmRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Remove song">
                    <Ionicons name="trash-outline" size={18} color="#d4d4d8" />
                  </TouchableOpacity>
                )
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </>
  );
}

type Collaborator = { id: string; user_id: string; role: string; display_name: string | null; last_name: string | null; username: string | null };

const ROLE_LABELS: Record<string, string> = { editor: 'Editor', viewer: 'Viewer', 'co-owner': 'Co-owner' };

function SetSettingsModal({
  visible,
  setId,
  isOwner,
  canManage,
  linkSharing,
  collaborators,
  onClose,
  onSharingChange,
  onCollaboratorAdded,
  onCollaboratorRemoved,
  onCollaboratorRoleChanged,
}: {
  visible: boolean;
  setId: string;
  isOwner: boolean;
  canManage: boolean;
  linkSharing: string;
  collaborators: Collaborator[];
  onClose: () => void;
  onSharingChange: (mode: 'private' | 'link' | 'public') => void;
  onCollaboratorAdded: (c: Collaborator) => void;
  onCollaboratorRemoved: (id: string) => void;
  onCollaboratorRoleChanged: (id: string, role: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{ id: string; display_name: string | null; last_name: string | null; username: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer' | 'co-owner'>('editor');
  const [busyId, setBusyId] = useState<string | null>(null);

  // Co-owner may only be granted to a named user, and only by the owner.
  const inviteRoleOptions: ('editor' | 'viewer' | 'co-owner')[] = isOwner ? ['editor', 'viewer', 'co-owner'] : ['editor', 'viewer'];

  useEffect(() => {
    if (!visible) { setSearchQuery(''); setSearchResults([]); setAddedIds(new Set()); setInviteRole('editor'); }
  }, [visible]);

  useEffect(() => {
    if (searchQuery.trim().length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => runSearch(searchQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  async function runSearch(q: string) {
    setSearching(true);
    const { data } = await supabase.rpc('search_users', {
      search_query: q.startsWith('@') ? q.slice(1) : q,
      exclude_user_id: '',
    });
    const existing = new Set(collaborators.map(c => c.user_id));
    setSearchResults(((data ?? []) as any[]).filter((u: any) => !existing.has(u.id)));
    setSearching(false);
  }

  async function handleAddCollaborator(user: { id: string; display_name: string | null; last_name: string | null; username: string | null }) {
    setBusyId(user.id);
    const { ok, json } = await setApi(`/api/sets/${setId}/invite`, 'POST', { inviteeUserId: user.id, role: inviteRole });
    setBusyId(null);
    if (!ok) { Alert.alert('Error', json?.error ?? 'Could not add collaborator.'); return; }
    setAddedIds(prev => new Set([...prev, user.id]));
    const c = json?.collaborator;
    if (c) {
      onCollaboratorAdded({
        id: c.id,
        user_id: c.user_id,
        role: c.role,
        display_name: c.profiles?.display_name ?? user.display_name,
        last_name: c.profiles?.last_name ?? user.last_name,
        username: c.profiles?.username ?? user.username,
      });
    }
    setSearchQuery('');
    setSearchResults([]);
  }

  function handleRemoveCollaborator(collab: Collaborator) {
    Alert.alert(
      'Remove collaborator',
      `Remove ${collab.display_name ?? collab.username ?? 'this person'}?`,
      [
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setBusyId(collab.id);
            const { ok, json } = await setApi(`/api/sets/${setId}/invite/link`, 'DELETE', { inviteId: collab.id });
            setBusyId(null);
            if (!ok) { Alert.alert('Error', json?.error ?? 'Could not remove collaborator.'); return; }
            onCollaboratorRemoved(collab.id);
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  function changeRole(collab: Collaborator, event: GestureResponderEvent) {
    const apply = async (role: 'editor' | 'viewer' | 'co-owner') => {
      if (role === collab.role) return;
      setBusyId(collab.id);
      const { ok, json } = await setApi(`/api/sets/${setId}/collaborators`, 'PATCH', { collaboratorId: collab.id, role });
      setBusyId(null);
      if (!ok) { Alert.alert('Error', json?.error ?? 'Could not change role.'); return; }
      onCollaboratorRoleChanged(collab.id, role);
    };
    showOptionsSheet({
      title: 'Change role',
      anchor: anchorFrom(event),
      options: inviteRoleOptions.map(r => ({ label: ROLE_LABELS[r], onPress: () => apply(r) })),
    });
  }

  // Owner manages everyone; a co-owner manages only non-co-owner collaborators.
  const canManageCollaborator = (c: Collaborator) => isOwner || (canManage && c.role !== 'co-owner');

  const SHARING_OPTIONS: { value: 'private' | 'link' | 'public'; label: string; desc: string }[] = [
    { value: 'private', label: 'Private', desc: 'Only you and collaborators' },
    { value: 'link', label: 'Open link', desc: 'Anyone with the link can join as viewer' },
    { value: 'public', label: 'Public', desc: 'Visible to everyone on SingJam' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView className="flex-1 bg-white" behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Done</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900">Invite people</Text>
          <View style={{ width: 48 }} />
        </View>

        <ScrollView keyboardShouldPersistTaps="handled">
          {/* Sharing controls (owner + co-owners) */}
          {canManage && (
            <View className="px-4 pt-5 pb-2">
              <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Sharing</Text>
              {SHARING_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => onSharingChange(opt.value)}
                  className={`flex-row items-center px-4 py-3 mb-2 rounded-xl border ${linkSharing === opt.value ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white'}`}
                >
                  <View className="flex-1">
                    <Text className={`font-semibold ${linkSharing === opt.value ? 'text-amber-800' : 'text-zinc-900'}`}>{opt.label}</Text>
                    <Text className="text-xs text-zinc-400 mt-0.5">{opt.desc}</Text>
                  </View>
                  {linkSharing === opt.value && <Ionicons name="checkmark" size={18} color="#d97706" />}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Collaborators */}
          <View className="px-4 pt-4 pb-8">
            <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400 mb-3">Collaborators</Text>

            {collaborators.length === 0 ? (
              <Text className="text-zinc-400 text-sm mb-4">No collaborators yet.</Text>
            ) : (
              collaborators.map(c => (
                <View key={c.id} className="flex-row items-center py-2 border-b border-zinc-50">
                  <View className="flex-1">
                    <Text className="text-zinc-900 font-medium">{c.display_name ?? c.username ?? 'Unknown'}</Text>
                    {c.username ? <Text className="text-xs text-zinc-400">@{c.username}</Text> : null}
                  </View>
                  {canManageCollaborator(c) ? (
                    <TouchableOpacity
                      onPress={(e) => changeRole(c, e)}
                      disabled={busyId === c.id}
                      className="flex-row items-center mr-3"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text className="text-xs text-amber-600 font-medium mr-0.5">{ROLE_LABELS[c.role] ?? c.role}</Text>
                      <Ionicons name="chevron-down" size={12} color="#d97706" />
                    </TouchableOpacity>
                  ) : (
                    <Text className="text-xs text-zinc-400 mr-3">{ROLE_LABELS[c.role] ?? c.role}</Text>
                  )}
                  {canManageCollaborator(c) && (
                    <TouchableOpacity onPress={() => handleRemoveCollaborator(c)} disabled={busyId === c.id} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Ionicons name="close-circle-outline" size={18} color="#a1a1aa" />
                    </TouchableOpacity>
                  )}
                </View>
              ))
            )}

            {canManage && (
              <View className="mt-4">
                {/* Invite role */}
                <View className="flex-row gap-2 mb-2">
                  {inviteRoleOptions.map(r => (
                    <TouchableOpacity
                      key={r}
                      onPress={() => setInviteRole(r)}
                      className={`px-3 py-1 rounded-full border ${inviteRole === r ? 'bg-amber-500 border-amber-500' : 'bg-white border-zinc-200'}`}
                    >
                      <Text className={`text-xs font-medium ${inviteRole === r ? 'text-white' : 'text-zinc-600'}`}>{ROLE_LABELS[r]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text className="text-xs text-zinc-400 mb-2">{SET_ROLE_DESCRIPTIONS[inviteRole]}</Text>
                <View className="flex-row items-center bg-zinc-100 rounded-xl px-3 py-2 mb-2">
                  <Ionicons name="search" size={14} color="#a1a1aa" style={{ marginRight: 6 }} />
                  <TextInput
                    className="flex-1 text-zinc-900"
                    placeholder="Search by name or @username…"
                    placeholderTextColor="#a1a1aa"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {searching && <ActivityIndicator size="small" color="#a1a1aa" />}
                </View>
                {searchResults.map(user => {
                  const name = [user.display_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Unknown';
                  const isAdded = addedIds.has(user.id);
                  return (
                    <View key={user.id} className="flex-row items-center py-2 border-b border-zinc-50">
                      <View className="flex-1">
                        <Text className="text-zinc-900 font-medium">{name}</Text>
                        {user.username ? <Text className="text-xs text-zinc-400">@{user.username}</Text> : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => handleAddCollaborator(user)}
                        disabled={isAdded || busyId === user.id}
                        className={`rounded-full px-3 py-1 ${isAdded ? 'bg-green-100' : 'bg-amber-500'}`}
                      >
                        <Text className={`text-xs font-semibold ${isAdded ? 'text-green-700' : 'text-white'}`}>
                          {isAdded ? 'Added' : busyId === user.id ? 'Adding…' : 'Add'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function SetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [set, setSet] = useState<SetData | null>(null);
  const [songs, setSongs] = useState<SetSong[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [isCoOwner, setIsCoOwner] = useState(false);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blocked, setBlocked] = useState<'private' | 'join' | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  // As on web: order, key, played and leader saves go out one at a time per
  // song (the order per set), latest tap winning, and live updates for a field
  // still settling are ignored so they can't flip it back.
  const syncRef = useRef(createLatestWinsQueue());
  const [songKnowledge, setSongKnowledge] = useState<{ user_id: string; song_id: string; confidence: string; key_note: string | null }[]>([]);
  const [sortBy, setSortBy] = useState<SetSortOrder>('custom');
  const [filterQuery, setFilterQuery] = useState('');
  const [spotifyExporting, setSpotifyExporting] = useState(false);
  // The viewer's own role per song, which they can change from the row.
  const [myRepertoire, setMyRepertoire] = useState<Map<string, string>>(new Map());
  const [singingVoice, setSingingVoice] = useState<string | null>(null);

  useEffect(() => {
    if (id) load();
  }, [id]);

  // Live-sync the set the same way the web SetDetail does. Supabase can't
  // filter DELETE events (the old row is primary-key-only under RLS), so the
  // set_songs/set_collaborators DELETE handlers subscribe unfiltered and match
  // on the local `id` instead of trusting payload.old.
  useEffect(() => {
    if (!id) return;
    const bySong = 'id, song_id, position, key_note, notes, played, leader_user_ids, added_by_user_id, songs(title, display_artist, byline, song_productions(productions(name)), chord_chart_url, tonality, song_composers(people(name)))';
    const sortByPosition = (rows: SetSong[]) => [...rows].sort((a, b) => a.position - b.position);

    const channel = supabase
      .channel(`set-detail-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'set_songs', filter: `set_id=eq.${id}` },
        async (payload) => {
          const row = payload.new as any;
          const { data } = await supabase.from('set_songs').select(bySong).eq('id', row.id).single();
          if (!data) return;
          setSongs((prev) =>
            prev.some((s) => s.id === row.id) ? prev : sortByPosition([...prev, data as any as SetSong])
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'set_songs', filter: `set_id=eq.${id}` },
        (payload) => {
          const row = payload.new as any;
          setSongs((prev) =>
            sortByPosition(
              prev.map((s) =>
                s.id === row.id
                  ? { ...s, ...settledFields(s, row), notes: row.notes }
                  : s
              )
            )
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'set_songs' },
        (payload) => {
          const row = payload.old as any;
          setSongs((prev) => prev.filter((s) => s.id !== row.id));
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'sets', filter: `id=eq.${id}` },
        (payload) => {
          const row = payload.new as any;
          setSet((prev) =>
            prev
              ? {
                  ...prev,
                  name: row.name,
                  description: row.description ?? null,
                  link_sharing: row.link_sharing,
                  spotify_playlist_id: row.spotify_playlist_id ?? null,
                }
              : prev
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'set_collaborators', filter: `set_id=eq.${id}` },
        async (payload) => {
          const row = payload.new as any;
          if (row.status !== 'accepted') return;
          const { data: prof } = await supabase.from('profiles').select('display_name, last_name, username').eq('id', row.user_id).single();
          setCollaborators((prev) =>
            prev.some((c) => c.id === row.id)
              ? prev
              : [...prev, { id: row.id, user_id: row.user_id, role: row.role, display_name: (prof as any)?.display_name ?? null, last_name: (prof as any)?.last_name ?? null, username: (prof as any)?.username ?? null }]
          );
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'set_collaborators', filter: `set_id=eq.${id}` },
        async (payload) => {
          const row = payload.new as any;
          const old = payload.old as any;
          if (row.status === 'accepted' && old.status !== 'accepted') {
            const { data: prof } = await supabase.from('profiles').select('display_name, last_name, username').eq('id', row.user_id).single();
            setCollaborators((prev) =>
              prev.some((c) => c.id === row.id)
                ? prev
                : [...prev, { id: row.id, user_id: row.user_id, role: row.role, display_name: (prof as any)?.display_name ?? null, last_name: (prof as any)?.last_name ?? null, username: (prof as any)?.username ?? null }]
            );
          } else if (row.status === 'accepted') {
            setCollaborators((prev) => prev.map((c) => (c.id === row.id ? { ...c, role: row.role } : c)));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'set_collaborators' },
        (payload) => {
          const row = payload.old as any;
          setCollaborators((prev) => prev.filter((c) => c.id !== row.id));
        }
      );

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    setMyUserId(user?.id ?? null);

    const [setRes, songsRes, collabRes, allCollabRes] = await Promise.all([
      supabase
        .from('sets')
        .select('id, name, description, owner_user_id, link_sharing, spotify_playlist_id, profiles(display_name, last_name, username)')
        .eq('id', id)
        .single(),
      supabase
        .from('set_songs')
        .select('id, song_id, position, key_note, notes, played, leader_user_ids, added_by_user_id, songs(title, display_artist, byline, song_productions(productions(name)), chord_chart_url, tonality, song_composers(people(name)))')
        .eq('set_id', id)
        .order('position', { ascending: true }),
      user
        ? supabase
            .from('set_collaborators')
            .select('role')
            .eq('set_id', id)
            .eq('user_id', user.id)
            .eq('status', 'accepted')
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('set_collaborators')
        .select('id, user_id, role, profiles(display_name, last_name, username)')
        .eq('set_id', id)
        .eq('status', 'accepted'),
    ]);

    if (!setRes.data) { setNotFound(true); setLoading(false); return; }

    const s = setRes.data as any;
    setSet(s);
    setSongs((songsRes.data ?? []) as any as SetSong[]);

    const isOwner = !!user && s.owner_user_id === user.id;
    const myRole = (collabRes.data as { role?: string } | null)?.role ?? null;
    const coOwner = myRole === 'co-owner';
    setCanEdit(isOwner || myRole === 'editor' || coOwner);
    setIsCoOwner(coOwner);
    setMyRole(myRole);
    setIsCollaborator(!!collabRes.data);

    // Visibility gate, mirroring web set/[id]/page.tsx. RLS on `sets` is
    // `using (true)` — it will hand any row to any caller, anonymous included —
    // so private/link access is enforced here, not by the database.
    if (!isOwner && !collabRes.data) {
      if (s.link_sharing === 'private') setBlocked('private');
      else if (s.link_sharing === 'link' && !user) setBlocked('join');
    }

    const collabs: Collaborator[] = ((allCollabRes.data ?? []) as any[]).map((c: any) => ({
      id: c.id,
      user_id: c.user_id,
      role: c.role,
      display_name: c.profiles?.display_name ?? null,
      last_name: c.profiles?.last_name ?? null,
      username: c.profiles?.username ?? null,
    }));
    setCollaborators(collabs);
    setLoading(false);
  }

  function handleSongAdded(song: SetSong) {
    setSongs((prev) => [...prev, song]);
  }

  async function handleRemoveSong(songId: string) {
    const previous = songs;
    setSongs((prev) => prev.filter((s) => s.song_id !== songId).map((s, i) => ({ ...s, position: i + 1 })));
    const { ok, json } = await setApi(`/api/sets/${id}/songs/${songId}`, 'DELETE');
    if (!ok) { setSongs(previous); Alert.alert('Error', json?.error ?? 'Could not remove song.'); }
  }

  function settledFields(local: SetSong, server: { position: number; key_note: string | null; played: boolean; leader_user_ids: string[] | null }) {
    const q = syncRef.current;
    return {
      position: q.isPending('order') ? local.position : server.position,
      key_note: q.isPending(`key:${local.id}`) ? local.key_note : server.key_note,
      played: q.isPending(`played:${local.id}`) ? local.played : server.played,
      leader_user_ids: q.isPending(`leaders:${local.id}`) ? local.leader_user_ids : server.leader_user_ids ?? [],
    };
  }

  // After a failed save, show what the server actually has.
  async function resyncSongs() {
    const rows = await fetchAllRows<any>((from, to) =>
      supabase
        .from('set_songs')
        .select('id, position, key_note, played, leader_user_ids')
        .eq('set_id', id)
        .order('id')
        .range(from, to)
    ).catch(() => null);
    if (!rows) return;
    const byId = new Map(rows.map((r) => [r.id, r]));
    setSongs((prev) =>
      prev
        .map((s) => (byId.has(s.id) ? { ...s, ...settledFields(s, byId.get(s.id)) } : s))
        .sort((a, b) => a.position - b.position)
    );
  }

  function failed(message: string) {
    Alert.alert('Error', message);
    resyncSongs();
  }

  function saveOrder(list: SetSong[]) {
    const order = list.map((s) => ({ id: s.id, position: s.position }));
    syncRef.current.run('order', () => setApi(`/api/sets/${id}/songs/reorder`, 'PATCH', { order }), (res) => {
      if (!res?.ok) failed('Could not reorder the set.');
    });
  }

  function handleKeyChange(songId: string, key: string | null) {
    const entry = songs.find((s) => s.song_id === songId);
    if (!entry) return;
    setSongs((prev) => prev.map((s) => s.song_id === songId ? { ...s, key_note: key } : s));
    syncRef.current.run(`key:${entry.id}`, () => setApi(`/api/sets/${id}/songs/${songId}`, 'PATCH', { key_note: key }), (res) => {
      if (!res?.ok) failed(res?.json?.error ?? 'Could not update key.');
    });
  }

  async function handleNotesChange(songId: string, notes: string | null) {
    const previous = songs;
    setSongs((prev) => prev.map((s) => s.song_id === songId ? { ...s, notes } : s));
    const { ok, json } = await setApi(`/api/sets/${id}/songs/${songId}`, 'PATCH', { notes });
    if (!ok) { setSongs(previous); Alert.alert('Error', json?.error ?? 'Could not save note.'); }
  }

  function handleLeaderToggle(songId: string, newLeaderIds: string[]) {
    const entry = songs.find((s) => s.song_id === songId);
    if (!entry) return;
    setSongs((prev) => prev.map((s) => s.song_id === songId ? { ...s, leader_user_ids: newLeaderIds } : s));
    // Guests can only add or remove themselves; the API merges that into the
    // current leaders so it can't undo a change someone else just made.
    const manage = set?.owner_user_id === myUserId || isCoOwner;
    const body = manage
      ? { leader_user_ids: newLeaderIds }
      : { self_leader: !!myUserId && newLeaderIds.includes(myUserId) };
    syncRef.current.run(`leaders:${entry.id}`, () => setApi(`/api/sets/${id}/songs/${songId}`, 'PATCH', body), (res) => {
      if (!res?.ok || !Array.isArray(res.json?.leader_user_ids)) { failed(res?.json?.error ?? 'Could not update leaders.'); return; }
      const keepKey = syncRef.current.isPending(`key:${entry.id}`);
      setSongs((prev) => prev.map((s) => s.song_id === songId ? {
        ...s,
        leader_user_ids: res.json.leader_user_ids,
        ...(!keepKey && 'key_note' in res.json ? { key_note: res.json.key_note } : {}),
      } : s));
    });
  }

  function handleReorder(data: SetSong[]) {
    const reordered = data.map((s, i) => ({ ...s, position: i + 1 }));
    setSongs(reordered);
    saveOrder(reordered);
  }

  function handleTogglePlayed(song: SetSong, played: boolean) {
    const reordered = reorderSongsForPlayed(songs, song.id, played)
      .map((s, i) => ({ ...s, position: i + 1 }));
    setSongs(reordered);
    syncRef.current.run(`played:${song.id}`, () => setApi(`/api/sets/${id}/songs/${song.song_id}`, 'PATCH', { played }), (res) => {
      if (!res?.ok) failed(res?.json?.error ?? 'Could not update the set.');
    });
    saveOrder(reordered);
  }

  async function handleSpotifyExport() {
    setSpotifyExporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`${WEB_URL}/api/sets/${id}/playlists/spotify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ songOrder: songs.map(s => s.song_id) }),
      });
      const json = await res.json();
      if (!res.ok) {
        Alert.alert('Export failed', json.error === 'spotify_auth_expired'
          ? 'The Spotify connection has expired. An admin has been notified.'
          : json.error ?? 'Something went wrong.');
        return;
      }
      setSet(prev => prev ? { ...prev, spotify_playlist_id: json.url } : prev);
      Alert.alert(
        'Exported to Spotify',
        `${json.added} of ${json.total} songs added.`,
        [
          { text: 'Open playlist', onPress: () => Linking.openURL(json.url) },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } catch {
      Alert.alert('Error', 'Could not reach the server.');
    } finally {
      setSpotifyExporting(false);
    }
  }

  async function handleSharingChange(mode: 'private' | 'link' | 'public') {
    if (!set) return;
    const previous = set.link_sharing;
    setSet(prev => prev ? { ...prev, link_sharing: mode } : prev);
    const { ok, json } = await setApi(`/api/sets/${id}`, 'PATCH', { link_sharing: mode });
    if (!ok) {
      setSet(prev => prev ? { ...prev, link_sharing: previous } : prev);
      Alert.alert('Error', json?.error ?? 'Could not update sharing.');
    }
  }

  function confirmDeleteSet() {
    Alert.alert(
      'Delete Set',
      `Delete "${set?.name}"? This cannot be undone.`,
      [
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { ok, json } = await setApi(`/api/sets/${id}`, 'DELETE');
            if (!ok) { Alert.alert('Error', json?.error ?? 'Could not delete the set.'); return; }
            router.back();
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  }

  // Owner + accepted collaborators, mirroring web SetDetail's `participants`.
  const participants: Participant[] = useMemo(() => {
    if (!set) return [];
    const owner: Participant[] = set.profiles
      ? [{ user_id: set.owner_user_id, display_name: set.profiles.display_name, last_name: set.profiles.last_name, username: set.profiles.username }]
      : [];
    return [
      ...owner,
      ...collaborators
        .filter((c) => c.user_id)
        .map((c) => ({ user_id: c.user_id, display_name: c.display_name, last_name: c.last_name, username: c.username })),
    ];
  }, [set, collaborators]);

  // Fetch each participant's repertoire confidence for the set's songs so rows can
  // show Lead/Support pills. Keyed on the id lists so it re-runs when either changes.
  const participantIdsKey = participants.map((p) => p.user_id).sort().join(',');
  const songIdsKey = songs.map((s) => s.song_id).sort().join(',');
  useEffect(() => {
    const participantIds = participantIdsKey ? participantIdsKey.split(',') : [];
    const songIds = songIdsKey ? songIdsKey.split(',') : [];
    if (!participantIds.length || !songIds.length) { setSongKnowledge([]); return; }
    let cancelled = false;
    supabase
      .from('user_songs')
      .select('user_id, song_id, confidence, key_note')
      .in('user_id', participantIds)
      .in('song_id', songIds)
      .in('confidence', ['lead', 'support', 'learn'])
      .then(({ data }) => { if (!cancelled) setSongKnowledge((data ?? []) as any); });
    return () => { cancelled = true; };
  }, [participantIdsKey, songIdsKey]);

  useEffect(() => {
    const songIds = songIdsKey ? songIdsKey.split(',') : [];
    if (!myUserId || !songIds.length) { setMyRepertoire(new Map()); return; }
    let cancelled = false;
    Promise.all([
      supabase.from('user_songs').select('song_id, confidence').eq('user_id', myUserId).in('song_id', songIds),
      supabase.from('profiles').select('singing_voice').eq('id', myUserId).maybeSingle(),
    ]).then(([repRes, profileRes]) => {
      if (cancelled) return;
      setMyRepertoire(new Map(((repRes.data ?? []) as { song_id: string; confidence: string }[]).map((r) => [r.song_id, r.confidence])));
      setSingingVoice((profileRes.data as { singing_voice: string | null } | null)?.singing_voice ?? null);
    });
    return () => { cancelled = true; };
  }, [myUserId, songIdsKey]);

  async function handleSetMyConfidence(songId: string, confidence: string) {
    if (!myUserId) { router.push('/(auth)/sign-in' as any); return; }
    if (!(await ensureLeadVoice(confidence, singingVoice, myUserId, setSingingVoice))) return;
    const uid = myUserId;
    const previous = myRepertoire;
    const previousKnowledge = songKnowledge;
    setMyRepertoire((prev) => new Map(prev).set(songId, confidence));
    setSongKnowledge((prev) => [
      ...prev.filter((k) => !(k.user_id === uid && k.song_id === songId)),
      { user_id: uid, song_id: songId, confidence, key_note: prev.find((k) => k.user_id === uid && k.song_id === songId)?.key_note ?? null },
    ]);
    const { error } = await supabase
      .from('user_songs')
      .upsert({ user_id: uid, song_id: songId, confidence, updated_at: new Date().toISOString() }, { onConflict: 'user_id,song_id' });
    if (error) {
      setMyRepertoire(previous);
      setSongKnowledge(previousKnowledge);
      Alert.alert('Error', error.message);
    } else noteMySong(songId, { confidence });
  }

  // Per-song lookup: songId → Map<userId, confidence>.
  const songKnowledgeMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const k of songKnowledge) {
      if (!m.has(k.song_id)) m.set(k.song_id, new Map());
      m.get(k.song_id)!.set(k.user_id, k.confidence);
    }
    return m;
  }, [songKnowledge]);

  // Per-song lookup: songId → Map<userId, the key they play it in>.
  const songKeyMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const k of songKnowledge) {
      if (!k.key_note) continue;
      if (!m.has(k.song_id)) m.set(k.song_id, new Map());
      m.get(k.song_id)!.set(k.user_id, k.key_note);
    }
    return m;
  }, [songKnowledge]);

  const displayedSongs = useMemo(() => {
    let result = songs;
    if (filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      result = result.filter(s => s.songs.title.toLowerCase().includes(q) || `${s.songs.byline ?? ''} ${s.songs.display_artist ?? ''}`.toLowerCase().includes(q));
    }
    if (sortBy === 'title_asc') return [...result].sort((a, b) => a.songs.title.localeCompare(b.songs.title));
    if (sortBy === 'title_desc') return [...result].sort((a, b) => b.songs.title.localeCompare(a.songs.title));
    return result;
  }, [songs, sortBy, filterQuery]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <View className="flex-1 bg-white items-center justify-center">
          <ActivityIndicator color="#d97706" />
        </View>
      </>
    );
  }

  if (notFound || !set) {
    return (
      <>
        <Stack.Screen options={{ title: 'Set' }} />
        <View className="flex-1 bg-white items-center justify-center">
          <Text className="text-zinc-400">Set not found</Text>
        </View>
      </>
    );
  }

  // Web serves these two as SetRequestAccess / SetJoinPrompt; native has neither
  // flow yet, so it explains the block instead of showing the set.
  if (blocked) {
    return (
      <>
        <Stack.Screen options={{ title: 'Set' }} />
        <View className="flex-1 bg-slate-50 justify-center">
          {blocked === 'private' ? (
            <PromptCard
              variant="guest"
              title="This set is private"
              body="Only its owner and collaborators can open it. Ask them to share it with you."
              {...(myUserId ? {} : { actionLabel: 'Sign in →', onAction: () => router.push('/(auth)/sign-in' as any) })}
            />
          ) : (
            <PromptCard
              variant="guest"
              title="Sign in to open this set"
              body="This set is shared by link, and joining it needs a SingJam account."
              actionLabel="Sign in →"
              onAction={() => router.push('/(auth)/sign-in' as any)}
            />
          )}
        </View>
      </>
    );
  }

  const isOwner = set.owner_user_id === myUserId;
  const isPublicViewer = !isOwner && !isCollaborator;
  const canManage = isOwner || isCoOwner;
  const existingIds = new Set(songs.map((s) => s.song_id));
  const canDrag = canManage && sortBy === 'custom' && !filterQuery.trim();

  // Per-song leader/support inputs, mirroring web SetDetail's row wiring.
  const leaderProps = (song: SetSong) => {
    const knowledgeForSong = songKnowledgeMap.get(song.song_id) ?? new Map<string, string>();
    const hasEligible = [...knowledgeForSong.values()].some((c) => c === 'lead');
    const rowParticipants = participants.filter(
      (p) => knowledgeForSong.has(p.user_id) || (song.leader_user_ids ?? []).includes(p.user_id)
    );
    const participantKeys = songKeyMap.get(song.song_id) ?? new Map<string, string>();
    return {
      participants: rowParticipants,
      participantKnowledge: knowledgeForSong,
      participantKeys,
      hasEligible,
      isPublicViewer,
      myConfidence: myRepertoire.get(song.song_id) ?? null,
      onSetMyConfidence: (level: string) => handleSetMyConfidence(song.song_id, level),
    };
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: set.name,
          headerTintColor: '#d97706',
          headerRight: () => (
            <View className="flex-row gap-4">
              {canEdit && (
                <TouchableOpacity onPress={() => setSettingsVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityLabel="Invite people">
                  <Ionicons name="person-add-outline" size={20} color="#71717a" />
                </TouchableOpacity>
              )}
              {isOwner && (
                <TouchableOpacity onPress={confirmDeleteSet} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={20} color="#ef4444" />
                </TouchableOpacity>
              )}
            </View>
          ),
        }}
      />

      <AddSongModal
        visible={addModalVisible}
        existingIds={existingIds}
        userId={myUserId}
        singingVoice={singingVoice}
        onVoiceUpgraded={setSingingVoice}
        onClose={() => setAddModalVisible(false)}
        onAdded={handleSongAdded}
      />

      <SetSettingsModal
        visible={settingsVisible}
        setId={id}
        isOwner={isOwner}
        canManage={canManage}
        linkSharing={set.link_sharing ?? 'private'}
        collaborators={collaborators}
        onClose={() => setSettingsVisible(false)}
        onSharingChange={handleSharingChange}
        onCollaboratorAdded={(c) => setCollaborators(prev => prev.some(x => x.id === c.id) ? prev : [...prev, c])}
        onCollaboratorRemoved={(cid) => setCollaborators(prev => prev.filter(c => c.id !== cid))}
        onCollaboratorRoleChanged={(cid, role) => setCollaborators(prev => prev.map(c => c.id === cid ? { ...c, role } : c))}
      />

      <ContentContainer style={{ backgroundColor: 'white' }}>
      <View className="flex-1 bg-white">
        {set.description ? (
          <View className="px-4 py-3 border-b border-zinc-100">
            <Text className="text-zinc-500 text-sm">{set.description}</Text>
          </View>
        ) : null}

        {/* Sort tabs + filter */}
        {songs.length > 0 && (
          <View className="px-4 pt-2 pb-2 border-b border-zinc-100">
            <View className="flex-row items-center bg-zinc-100 rounded-xl px-3 py-2 mb-2">
              <Ionicons name="search" size={16} color="#a1a1aa" style={{ marginRight: 8 }} />
              <TextInput
                className="flex-1 text-zinc-900 text-sm"
                placeholder="Filter songs…"
                placeholderTextColor="#a1a1aa"
                value={filterQuery}
                onChangeText={setFilterQuery}
                autoCapitalize="none"
                returnKeyType="search"
              />
              {filterQuery.length > 0 && (
                <TouchableOpacity onPress={() => setFilterQuery('')}>
                  <Text className="text-zinc-400 ml-2">✕</Text>
                </TouchableOpacity>
              )}
            </View>
            <View className="flex-row gap-2">
              {(['custom', 'title_asc', 'title_desc'] as SetSortOrder[]).map(key => (
                <TouchableOpacity
                  key={key}
                  onPress={() => setSortBy(key)}
                  className={`px-3 py-1 rounded-full border ${sortBy === key ? 'bg-amber-500 border-amber-500' : 'bg-white border-zinc-200'}`}
                >
                  <Text className={`text-xs font-medium ${sortBy === key ? 'text-white' : 'text-zinc-600'}`}>
                    {key === 'custom' ? 'Custom' : key === 'title_asc' ? 'A–Z' : 'Z–A'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {songs.some((s) => s.songs.chord_chart_url) && <UgBackTip />}

        {songs.length === 0 ? (
          <View className="flex-1 items-center justify-center py-20 px-8">
            <Text className="text-zinc-900 font-semibold mb-1">No songs yet</Text>
            <Text className="text-zinc-400 text-sm text-center">
              {canEdit ? 'Tap "Add Song" to start building this set.' : 'This set has no songs yet.'}
            </Text>
          </View>
        ) : canDrag ? (
          <DraggableFlatList
            data={songs}
            keyExtractor={(item) => item.id}
            onDragEnd={({ data }) => handleReorder(data)}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: canEdit ? 140 : 40 }}
            renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<SetSong>) => (
              <ScaleDecorator>
                <SongRow
                  song={item}
                  canManage={canManage}
                  canRemove={canRemoveSetSong(isOwner, myRole, item.added_by_user_id, myUserId)}
                  myUserId={myUserId}
                  displayPosition={(getIndex() ?? 0) + 1}
                  drag={drag}
                  isActive={isActive}
                  {...leaderProps(item)}
                  onRemove={() => handleRemoveSong(item.song_id)}
                  onKeyChange={(key) => handleKeyChange(item.song_id, key)}
                  onNotesChange={(notes) => handleNotesChange(item.song_id, notes)}
                  onLeaderToggle={(newIds) => handleLeaderToggle(item.song_id, newIds)}
                  onTogglePlayed={() => handleTogglePlayed(item, !item.played)}
                />
              </ScaleDecorator>
            )}
          />
        ) : (
          <FlatList
            data={displayedSongs}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: canEdit ? 140 : 40 }}
            ListEmptyComponent={
              <View className="items-center justify-center py-16 px-8">
                <Text className="text-zinc-400 text-sm">No songs match this filter</Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <SongRow
                song={item}
                canManage={canManage}
                canRemove={canRemoveSetSong(isOwner, myRole, item.added_by_user_id, myUserId)}
                myUserId={myUserId}
                displayPosition={index + 1}
                {...leaderProps(item)}
                onRemove={() => handleRemoveSong(item.song_id)}
                onKeyChange={(key) => handleKeyChange(item.song_id, key)}
                onNotesChange={(notes) => handleNotesChange(item.song_id, notes)}
                onLeaderToggle={(newIds) => handleLeaderToggle(item.song_id, newIds)}
                onTogglePlayed={() => handleTogglePlayed(item, !item.played)}
              />
            )}
          />
        )}

        {canEdit ? (
          <View className="absolute bottom-0 left-0 right-0 px-4 pb-8 pt-2 bg-white border-t border-zinc-100">
            {isOwner && (
              <TouchableOpacity
                onPress={spotifyExporting ? undefined : handleSpotifyExport}
                disabled={spotifyExporting}
                className="flex-row items-center justify-center gap-2 py-2.5 mb-2 rounded-xl border border-zinc-200"
              >
                {spotifyExporting ? (
                  <ActivityIndicator size="small" color="#1db954" />
                ) : (
                  <Ionicons name="musical-notes-outline" size={16} color="#1db954" />
                )}
                <Text className="text-zinc-700 text-sm font-medium">
                  {set.spotify_playlist_id
                    ? (spotifyExporting ? 'Syncing…' : 'Sync Spotify playlist')
                    : (spotifyExporting ? 'Exporting…' : 'Export to Spotify')}
                </Text>
                {set.spotify_playlist_id && !spotifyExporting ? (
                  <Ionicons name="open-outline" size={13} color="#a1a1aa" />
                ) : null}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={() => setAddModalVisible(true)}
              className="bg-amber-500 rounded-xl py-3.5 items-center flex-row justify-center gap-2"
            >
              <Ionicons name="add" size={18} color="white" />
              <Text className="text-white font-semibold">Add Song</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
      </ContentContainer>
    </>
  );
}
