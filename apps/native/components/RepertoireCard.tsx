import { memo } from 'react';
import { View, Text, TouchableOpacity, Linking, Alert } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatComposers, formatJammers } from '@singjam/core';
import SubtitleText from '@/components/SubtitleText';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import RolePill from '@/components/RolePill';
import MyKeyChip from '@/components/MyKeyChip';

export type RepertoireCardSong = {
  song_id: string;
  title: string;
  confidence: string;
  key_note: string | null;
  display_artist: string | null;
  byline?: string | null;
  composers: string[];
  cultures: string[];
  communities?: string[];
  productions: string[];
  popularity: number;
  chord_chart_url?: string | null;
};

// Every callback takes the song back rather than being bound to it, so a list
// can hand each row the same functions and let memo skip the untouched ones.
type Props = {
  song: RepertoireCardSong;
  selected: boolean;
  isLast: boolean;
  onToggleSelect: (song: RepertoireCardSong) => void;
  onConfidenceChange: (song: RepertoireCardSong, confidence: string) => void;
  onKeyTap: (song: RepertoireCardSong) => void;
  onAddToSet: (song: RepertoireCardSong) => void;
  onView: (song: RepertoireCardSong) => void;
};

// Mirrors the repertoire row card in web's repertoire/page.tsx: checkbox,
// title + (songwriters), production/artist line, jammer count, then a
// confidence control, the member's own key + Add to set / View actions.
function RepertoireCard({
  song, selected, isLast,
  onToggleSelect, onConfidenceChange, onKeyTap, onAddToSet, onView,
}: Props) {
  function handleConfidenceTap(event: GestureResponderEvent) {
    showOptionsSheet({
      title: song.title,
      anchor: anchorFrom(event),
      options: [
        { label: 'Lead', onPress: () => onConfidenceChange(song, 'lead') },
        { label: 'Support', onPress: () => onConfidenceChange(song, 'support') },
        { label: 'Learn', onPress: () => onConfidenceChange(song, 'learn') },
      ],
    });
  }

  const composersLabel = song.composers.length > 0
    ? formatComposers(song.composers, [...song.cultures, ...(song.communities ?? [])])
    : null;

  return (
    <View
      className={`mx-4 border-x border-b border-zinc-200 p-4 ${isLast ? 'rounded-b-md' : ''} ${
        selected ? 'bg-amber-50' : 'bg-white'
      }`}
    >
      <View className="flex-row items-start">
        <TouchableOpacity
          onPress={() => onToggleSelect(song)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="mt-0.5 mr-3"
        >
          <Ionicons
            name={selected ? 'checkbox' : 'square-outline'}
            size={20}
            color={selected ? '#d97706' : '#d4d4d8'}
          />
        </TouchableOpacity>

        <View className="flex-1 min-w-0">
          <TouchableOpacity onPress={() => onView(song)}>
            <Text numberOfLines={1}>
              <Text className="font-medium text-zinc-900">{song.title}</Text>
              {composersLabel ? (
                <Text className="text-zinc-400"> ({composersLabel})</Text>
              ) : null}
            </Text>
          </TouchableOpacity>
          <Text className="text-sm text-zinc-500 mt-0.5" numberOfLines={1}>
            <SubtitleText productions={song.productions} artist={song.byline ?? song.display_artist} fallback="—" />
          </Text>
          {song.popularity > 0 && (
            <Text className="text-xs text-zinc-400 mt-0.5">
              {formatJammers(song.popularity)}
            </Text>
          )}
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-2 mt-3 ml-8">
        <RolePill level={song.confidence} onPress={handleConfidenceTap} size="md" />
        <MyKeyChip value={song.key_note} onPress={() => onKeyTap(song)} size="md" />
        {song.chord_chart_url ? (
          // Same Chords link as the set list.
          <TouchableOpacity
            onPress={() => Linking.openURL(song.chord_chart_url!).catch(() => Alert.alert('Could not open link'))}
            className="flex-row items-center gap-1 px-3 py-1.5 rounded-full border border-zinc-200 bg-white"
            accessibilityLabel="Chord chart"
          >
            <Text className="text-sm font-medium text-zinc-600">Chords</Text>
            <Ionicons name="open-outline" size={11} color="#a1a1aa" />
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          onPress={() => onAddToSet(song)}
          className="rounded-full border border-zinc-200 bg-white px-3 py-1.5"
        >
          <Text className="text-sm text-zinc-600">Add to set</Text>
        </TouchableOpacity>


      </View>
    </View>
  );
}

export default memo(RepertoireCard);
