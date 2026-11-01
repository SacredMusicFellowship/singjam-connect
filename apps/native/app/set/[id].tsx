import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert,
  ActivityIndicator, Modal, FlatList, TextInput,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { supabase } from '@/lib/supabase';
import { setApi } from '@/lib/setApi';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import { formatComposers, reorderSongsForPlayed } from '@singjam/core';
import ContentContainer from '@/components/ContentContainer';
import PromptCard from '@/components/PromptCard';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

const MUSICAL_KEYS = ['A', 'Bb', 'B', 'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab'];

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
  played: boolean;
  leader_user_ids: string[];
  songs: {
    title: string;
    display_artist: string | null;
    song_composers: { people: { name: string } | null }[];
  };
};

type SongSearchResult = {
  song_id: string;
  title: string;
  display_artist: string | null;
};

function AddSongModal({
  visible,
  existingIds,
  onClose,
  onAdded,
}: {
  visible: boolean;
  existingIds: Set<string>;
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
    const { data } = await supabase
      .from('songs')
      .select('song_id, title, display_artist')
      .or(`title.ilike.%${q}%,display_artist.ilike.%${q}%`)
      .order('title')
      .limit(30);
    setResults(data ?? []);
    setSearching(false);
  }

  async function addSong(song: SongSearchResult) {
    setPendingId(song.song_id);
    const { ok, json } = await setApi(`/api/sets/${setId}/songs`, 'POST', { songId: song.song_id });
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
                    <Text className="text-zinc-900 font-medium" numberOfLines={1}>{item.title}</Text>
                    {item.display_artist ? (
                      <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>{item.display_artist}</Text>
                    ) : null}
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

function KeyPicker({
  visible,
  current,
  onClose,
  onSelect,
}: {
  visible: boolean;
  current: string | null;
  onClose: () => void;
  onSelect: (key: string | null) => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="flex-row items-center px-4 pt-4 pb-2 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose}>
            <Text className="text-amber-600 font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900">Select Key</Text>
          <TouchableOpacity onPress={() => { onSelect(null); onClose(); }}>
            <Text className="text-zinc-400 font-medium">Clear</Text>
          </TouchableOpacity>
        </View>
        <ScrollView>
          {MUSICAL_KEYS.map((k) => (
            <TouchableOpacity
              key={k}
              onPress={() => { onSelect(k); onClose(); }}
              className={`px-6 py-4 border-b border-zinc-100 flex-row items-center justify-between ${current === k ? 'bg-amber-50' : ''}`}
            >
              <Text className={`text-base ${current === k ? 'text-amber-700 font-semibold' : 'text-zinc-900'}`}>{k}</Text>
              {current === k ? <Ionicons name="checkmark" size={18} color="#d97706" /> : null}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SongRow({
  song,
  canEdit,
  displayPosition,
  drag,
  isActive,
  participants,
  participantKnowledge,
  hasEligible,
  isPublicViewer,
  onRemove,
  onKeyChange,
  onLeaderToggle,
  onTogglePlayed,
}: {
  song: SetSong;
  canEdit: boolean;
  displayPosition: number;
  drag?: () => void;
  isActive?: boolean;
  participants: Participant[];
  participantKnowledge: Map<string, string>;
  hasEligible: boolean;
  isPublicViewer: boolean;
  onRemove: () => void;
  onKeyChange: (key: string | null) => void;
  onLeaderToggle: (newLeaderIds: string[]) => void;
  onTogglePlayed: () => void;
}) {
  const [keyPickerVisible, setKeyPickerVisible] = useState(false);
  const composerNames = (song.songs.song_composers ?? [])
    .map((sc) => sc.people?.name)
    .filter(Boolean) as string[];
  const artist = song.songs.display_artist ?? formatComposers(composerNames, []);

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
    (leadParticipants.length > 0 || supportParticipants.length > 0 || learnParticipants.length > 0 || (canEdit && participants.length > 0));

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

  return (
    <>
      <KeyPicker
        visible={keyPickerVisible}
        current={song.key_note}
        onClose={() => setKeyPickerVisible(false)}
        onSelect={onKeyChange}
      />
      <View className={`px-4 py-3 border-b border-zinc-100 ${isActive ? 'bg-amber-50' : 'bg-white'}`}>
        <View className="flex-row items-center">
          {canEdit && drag ? (
            <TouchableOpacity
              onLongPress={drag}
              delayLongPress={150}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="mr-3"
            >
              <Ionicons name="reorder-three-outline" size={20} color="#a1a1aa" />
            </TouchableOpacity>
          ) : (
            <View className="w-7 items-center mr-2">
              <Text className="text-zinc-300 text-sm font-medium">{displayPosition}</Text>
            </View>
          )}
          <View className="flex-1 min-w-0">
            <Text className="text-zinc-900 font-medium" numberOfLines={1}>{song.songs.title}</Text>
            {artist ? (
              <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>{artist}</Text>
            ) : null}
          </View>
          {canEdit ? (
            <TouchableOpacity
              onPress={onTogglePlayed}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              className="mr-3"
            >
              <Ionicons
                name={song.played ? 'checkmark-circle' : 'checkmark-circle-outline'}
                size={18}
                color={song.played ? '#16a34a' : '#a1a1aa'}
              />
            </TouchableOpacity>
          ) : song.played ? (
            <View className="mr-3">
              <Ionicons name="checkmark-circle" size={18} color="#16a34a" />
            </View>
          ) : null}
          {canEdit ? (
            <TouchableOpacity
              onPress={() => setKeyPickerVisible(true)}
              className={`mr-3 px-2.5 py-1 rounded-lg border ${song.key_note ? 'border-amber-200 bg-amber-50' : 'border-zinc-200 bg-white'}`}
            >
              <Text className={`text-xs font-medium ${song.key_note ? 'text-amber-700' : 'text-zinc-400'}`}>
                {song.key_note ?? 'Key'}
              </Text>
            </TouchableOpacity>
          ) : song.key_note ? (
            <View className="mr-3 px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50">
              <Text className="text-xs font-medium text-amber-700">{song.key_note}</Text>
            </View>
          ) : null}
          {canEdit ? (
            <TouchableOpacity onPress={confirmRemove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="trash-outline" size={16} color="#a1a1aa" />
            </TouchableOpacity>
          ) : null}
        </View>

        {showLeaderBlock ? (
          <View className="mt-2 pl-9 gap-1">
            {(leadParticipants.length > 0 || (canEdit && participants.length > 0)) ? (
              <View className="flex-row items-start">
                <Text className="text-amber-500 text-[10px] font-medium mr-1.5 mt-1">Lead</Text>
                <View className="flex-row flex-wrap flex-1">
                  {canEdit && leaderIds.length === 0 && !hasEligible ? (
                    <View className="rounded-full border border-dashed border-amber-300 px-2 py-0.5 mr-1 mb-1">
                      <Text className="text-amber-500 text-xs font-medium">No leader</Text>
                    </View>
                  ) : null}
                  {leadParticipants.map((p) => {
                    const isLeader = leaderIds.includes(p.user_id);
                    const clickable = canEdit && participantKnowledge.get(p.user_id) === 'lead';
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
                        className={`rounded-full px-2 py-0.5 mr-1 mb-1 ${isLeader ? 'bg-amber-400' : 'bg-amber-100'}`}
                      >
                        <Text className={`text-xs font-medium ${isLeader ? 'text-white' : 'text-amber-700'}`}>
                          {participantLabel(p)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
            {supportParticipants.length > 0 ? (
              <View className="flex-row items-start">
                <Text className="text-sky-500 text-[10px] font-medium mr-1.5 mt-1">Support</Text>
                <View className="flex-row flex-wrap flex-1">
                  {supportParticipants.map((p) => (
                    <View key={p.user_id} className="rounded-full px-2 py-0.5 mr-1 mb-1 bg-sky-100">
                      <Text className="text-sky-700 text-xs font-medium">{participantLabel(p)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
            {learnParticipants.length > 0 ? (
              <View className="flex-row items-start">
                <Text className="text-zinc-400 text-[10px] font-medium mr-1.5 mt-1">Learning</Text>
                <View className="flex-row flex-wrap flex-1">
                  {learnParticipants.map((p) => (
                    <View key={p.user_id} className="rounded-full px-2 py-0.5 mr-1 mb-1 bg-zinc-100">
                      <Text className="text-zinc-600 text-xs font-medium">{participantLabel(p)}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
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
          <Text className="flex-1 text-center font-semibold text-zinc-900">Set Settings</Text>
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
  const [isCollaborator, setIsCollaborator] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blocked, setBlocked] = useState<'private' | 'join' | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [songKnowledge, setSongKnowledge] = useState<{ user_id: string; song_id: string; confidence: string }[]>([]);
  const [sortBy, setSortBy] = useState<SetSortOrder>('custom');
  const [filterQuery, setFilterQuery] = useState('');
  const [spotifyExporting, setSpotifyExporting] = useState(false);

  useEffect(() => {
    if (id) load();
  }, [id]);

  // Live-sync the set the same way the web SetDetail does. Supabase can't
  // filter DELETE events (the old row is primary-key-only under RLS), so the
  // set_songs/set_collaborators DELETE handlers subscribe unfiltered and match
  // on the local `id` instead of trusting payload.old.
  useEffect(() => {
    if (!id) return;
    const bySong = 'id, song_id, position, key_note, played, leader_user_ids, songs(title, display_artist, song_composers(people(name)))';
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
                  ? { ...s, position: row.position, key_note: row.key_note, played: row.played, leader_user_ids: row.leader_user_ids }
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
        .select('id, song_id, position, key_note, played, leader_user_ids, songs(title, display_artist, song_composers(people(name)))')
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

  async function handleKeyChange(songId: string, key: string | null) {
    const previous = songs;
    setSongs((prev) => prev.map((s) => s.song_id === songId ? { ...s, key_note: key } : s));
    const { ok, json } = await setApi(`/api/sets/${id}/songs/${songId}`, 'PATCH', { key_note: key });
    if (!ok) { setSongs(previous); Alert.alert('Error', json?.error ?? 'Could not update key.'); }
  }

  async function handleLeaderToggle(songId: string, newLeaderIds: string[]) {
    const previous = songs;
    setSongs((prev) => prev.map((s) => s.song_id === songId ? { ...s, leader_user_ids: newLeaderIds } : s));
    const { ok, json } = await setApi(`/api/sets/${id}/songs/${songId}`, 'PATCH', { leader_user_ids: newLeaderIds });
    if (!ok) { setSongs(previous); Alert.alert('Error', json?.error ?? 'Could not update leaders.'); }
  }

  async function handleReorder(data: SetSong[]) {
    const previous = songs;
    const reordered = data.map((s, i) => ({ ...s, position: i + 1 }));
    setSongs(reordered);
    const { ok } = await setApi(`/api/sets/${id}/songs/reorder`, 'PATCH', {
      order: reordered.map((s) => ({ id: s.id, position: s.position })),
    });
    if (!ok) { setSongs(previous); Alert.alert('Error', 'Could not reorder the set.'); }
  }

  async function handleTogglePlayed(song: SetSong, played: boolean) {
    const previous = songs;
    const reordered = reorderSongsForPlayed(songs, song.id, played)
      .map((s, i) => ({ ...s, position: i + 1 }));
    setSongs(reordered);
    const [playedRes, reorderRes] = await Promise.all([
      setApi(`/api/sets/${id}/songs/${song.song_id}`, 'PATCH', { played }),
      setApi(`/api/sets/${id}/songs/reorder`, 'PATCH', { order: reordered.map((s) => ({ id: s.id, position: s.position })) }),
    ]);
    if (!playedRes.ok || !reorderRes.ok) {
      setSongs(previous);
      Alert.alert('Error', 'Could not update the set.');
    }
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
      .select('user_id, song_id, confidence')
      .in('user_id', participantIds)
      .in('song_id', songIds)
      .in('confidence', ['lead', 'support', 'learn'])
      .then(({ data }) => { if (!cancelled) setSongKnowledge((data ?? []) as any); });
    return () => { cancelled = true; };
  }, [participantIdsKey, songIdsKey]);

  // Per-song lookup: songId → Map<userId, confidence>.
  const songKnowledgeMap = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const k of songKnowledge) {
      if (!m.has(k.song_id)) m.set(k.song_id, new Map());
      m.get(k.song_id)!.set(k.user_id, k.confidence);
    }
    return m;
  }, [songKnowledge]);

  const displayedSongs = useMemo(() => {
    let result = songs;
    if (filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      result = result.filter(s => s.songs.title.toLowerCase().includes(q) || (s.songs.display_artist ?? '').toLowerCase().includes(q));
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
  const canDrag = canEdit && sortBy === 'custom' && !filterQuery.trim();

  // Per-song leader/support inputs, mirroring web SetDetail's row wiring.
  const leaderProps = (song: SetSong) => {
    const knowledgeForSong = songKnowledgeMap.get(song.song_id) ?? new Map<string, string>();
    const hasEligible = [...knowledgeForSong.values()].some((c) => c === 'lead');
    const rowParticipants = participants.filter(
      (p) => knowledgeForSong.has(p.user_id) || (song.leader_user_ids ?? []).includes(p.user_id)
    );
    return { participants: rowParticipants, participantKnowledge: knowledgeForSong, hasEligible, isPublicViewer };
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
                <TouchableOpacity onPress={() => setSettingsVisible(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="settings-outline" size={20} color="#71717a" />
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
                    {key === 'custom' ? 'Custom' : key === 'title_asc' ? 'A → Z' : 'Z → A'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

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
            contentContainerStyle={{ paddingBottom: canEdit ? 140 : 40 }}
            renderItem={({ item, drag, isActive, getIndex }: RenderItemParams<SetSong>) => (
              <ScaleDecorator>
                <SongRow
                  song={item}
                  canEdit={canEdit}
                  displayPosition={(getIndex() ?? 0) + 1}
                  drag={drag}
                  isActive={isActive}
                  {...leaderProps(item)}
                  onRemove={() => handleRemoveSong(item.song_id)}
                  onKeyChange={(key) => handleKeyChange(item.song_id, key)}
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
            contentContainerStyle={{ paddingBottom: canEdit ? 140 : 40 }}
            ListEmptyComponent={
              <View className="items-center justify-center py-16 px-8">
                <Text className="text-zinc-400 text-sm">No songs match this filter</Text>
              </View>
            }
            renderItem={({ item, index }) => (
              <SongRow
                song={item}
                canEdit={canEdit}
                displayPosition={index + 1}
                {...leaderProps(item)}
                onRemove={() => handleRemoveSong(item.song_id)}
                onKeyChange={(key) => handleKeyChange(item.song_id, key)}
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
