import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, TextInput, Linking, useWindowDimensions } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CONFIDENCE_STYLES, KEY_STYLE, PEOPLE_ROW_LIMIT, prioritizePeople, SET_SONG_NOTE_MAX, shownPeopleCount, cardRowText, songSubtitle } from '@singjam/core';
import { WIDE_BREAKPOINT } from '@/components/BrandHeader';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import SubtitleText from '@/components/SubtitleText';
import KeyPicker from '@/components/KeyPicker';
import RolePill from '@/components/RolePill';
import { SongRowLine, type SongRowCard } from '@/components/SongRowTitle';

// Owner + accepted collaborators, used to render per-song Lead/Support pills.
export type Participant = {
  user_id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
};

function participantLabel(p: Participant): string {
  const first = p.display_name ?? p.username ?? '?';
  return p.last_name ? `${first} ${p.last_name[0].toUpperCase()}.` : first;
}

export type SetSong = {
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
    // The same card data as every other song list (songs.card, migration 234); absent on a row just added.
    card?: SongRowCard | null;
    chord_chart_url: string | null;
    tonality?: string | null;
    song_productions?: { productions: { name: string } | null }[];
  };
};

export default function SetSongRow({
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
  /** The viewer's own role for this song: null when it isn't in their songs, undefined until their songs have loaded. */
  myConfidence: string | null | undefined;
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
  const artist = song.songs.byline;
  const productions = (song.songs.song_productions ?? [])
    .map((sp) => sp.productions?.name)
    .filter(Boolean) as string[];
  const card = song.songs.card;
  // Writers in brackets and the line under the title, by the same rules as every other song list (web's SetSongRow).
  const row = card ? cardRowText({ title: song.songs.title, displayArtist: song.songs.display_artist, productions, card }) : null;

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
    // Signed out, the screen sends them to sign in rather than asking a part first, as web links straight there.
    if (!myUserId) { onSetMyConfidence('lead'); return; }
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
      <View className={`mx-4 mb-2 flex-row px-3 py-3 rounded-xl border ${isActive ? 'border-amber-300 bg-amber-50' : song.played ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-200 bg-white'}`}>
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
              <Text numberOfLines={2}>
                <Text className="text-zinc-900 font-medium">{song.songs.title}</Text>
                {row?.writers ? <Text className="text-zinc-400 text-sm">{` (${row.writers})`}</Text> : null}
              </Text>
              <View className="flex-row items-center mt-0.5">
                {row ? (
                  (row.shows.length > 0 || row.credits) ? (
                    <View className="flex-shrink mr-3">
                      <SongRowLine shows={row.shows} credits={row.credits} className="text-zinc-500 text-sm" />
                    </View>
                  ) : null
                ) : songSubtitle(productions, artist) && (
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

          {myConfidence === null ? (
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
                        <Text className={`text-xs ${CONFIDENCE_STYLES.support.pillText} ${nameWeight(p.user_id)}`}>
                          {participantLabel(p)}
                          {participantKeys.get(p.user_id) ? ` (${participantKeys.get(p.user_id)})` : null}
                        </Text>
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
