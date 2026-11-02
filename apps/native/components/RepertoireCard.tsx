import { memo } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatComposers } from '@singjam/core';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';

const CONFIDENCE_LEVELS = [
  { key: 'lead', label: 'Lead' },
  { key: 'support', label: 'Support' },
  { key: 'learn', label: 'Learn' },
];

export type RepertoireCardSong = {
  song_id: string;
  title: string;
  confidence: string;
  key_note: string | null;
  display_artist: string | null;
  composers: string[];
  cultures: string[];
  productions: string[];
  popularity: number;
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
  onRemove: (song: RepertoireCardSong) => void;
};

// Mirrors the repertoire row card in web's repertoire/page.tsx: checkbox,
// title + (songwriters), production/artist line, jammer count, then a
// confidence control, the member's own key + Add to set / View / Remove actions.
function RepertoireCard({
  song, selected, isLast,
  onToggleSelect, onConfidenceChange, onKeyTap, onAddToSet, onView, onRemove,
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

  function handleRemoveTap() {
    Alert.alert('Remove song', `Remove "${song.title}" from your repertoire?`, [
      { text: 'Remove', style: 'destructive', onPress: () => onRemove(song) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const composersLabel = song.composers.length > 0
    ? formatComposers(song.composers, song.cultures)
    : null;
  const confidenceLabel = CONFIDENCE_LEVELS.find(l => l.key === song.confidence)?.label ?? 'Learn';
  const isLead = song.confidence === 'lead';

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
            {song.productions.length > 0 ? (
              <>from <Text className="italic">{song.productions.join(', ')}</Text></>
            ) : (
              song.display_artist ?? '—'
            )}
          </Text>
          {song.popularity > 0 && (
            <Text className="text-xs text-zinc-400 mt-0.5">
              {song.popularity} {song.popularity === 1 ? 'jammer' : 'jammers'}
            </Text>
          )}
        </View>
      </View>

      <View className="flex-row flex-wrap items-center gap-2 mt-3 ml-8">
        <TouchableOpacity
          onPress={handleConfidenceTap}
          className={`flex-row items-center rounded-xl border px-2.5 py-1.5 ${
            isLead ? 'border-amber-400 bg-amber-100' : 'border-zinc-200 bg-white'
          }`}
        >
          <Text className={`text-sm ${isLead ? 'text-amber-800 font-semibold' : 'text-zinc-700'}`}>
            {confidenceLabel}
          </Text>
          <Ionicons name="chevron-down" size={12} color={isLead ? '#92400e' : '#71717a'} style={{ marginLeft: 4 }} />
        </TouchableOpacity>

        <View className="flex-row items-center gap-1.5">
          <Text className="text-sm text-zinc-700">My key</Text>
          <TouchableOpacity
            onPress={() => onKeyTap(song)}
            className={`flex-row items-center rounded-xl border px-2.5 py-1.5 ${
              song.key_note ? 'border-amber-200 bg-amber-50' : 'border-zinc-200 bg-white'
            }`}
            accessibilityLabel="My key"
          >
            <Text className={`text-sm ${song.key_note ? 'text-amber-800' : 'text-zinc-700'}`}>
              {song.key_note ?? '—'}
            </Text>
            <Ionicons name="chevron-down" size={12} color={song.key_note ? '#92400e' : '#71717a'} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() => onAddToSet(song)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5"
        >
          <Text className="text-sm text-zinc-600">Add to set</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onView(song)}
          className="rounded-xl border border-zinc-200 bg-white px-3 py-1.5"
        >
          <Text className="text-sm text-zinc-600">View</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleRemoveTap}
          className="rounded-xl border border-zinc-200 bg-white px-2 py-1"
        >
          <Text className="text-xs text-zinc-400">Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default memo(RepertoireCard);
