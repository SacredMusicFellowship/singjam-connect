import { memo } from 'react';
import { View, Text, TouchableOpacity, Alert, Linking } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { formatComposers } from '@singjam/core';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';

export type Suggestion = {
  song_id: string;
  title: string;
  display_artist: string | null;
  first_line: string | null;
  slug: string | null;
  composers: string[];
  cultures: string[];
  productions: string[];
  genres: string[];
  languages: string[];
  year: number | null;
  popularity: number;
  youtube_id: string | null;
  spotify_track_id: string | null;
};

const CONFIDENCE_LABELS: Record<string, string> = {
  lead: 'Lead',
  support: 'Support',
  learn: 'Learn',
};

// The callbacks take the song back rather than being bound to it, so a list can
// hand every row the same two functions and let memo do its job.
type Props = {
  song: Suggestion;
  canLead: boolean;
  onAdd: (song: Suggestion, confidence: string) => void;
  onView: (song: Suggestion) => void;
  // Set when the song is already in the user's repertoire: the Add button is
  // replaced by web's "✓ In your repertoire" pill plus a role control.
  confidence?: string | null;
};

// Mirrors web's SongCard: title + (songwriters) — production/artist (year),
// media links, genre chips + jammer count, then Add / View. Web embeds the
// YouTube and Spotify players inline; here they open the apps instead, since a
// WebView per row would hurt list scrolling and Spotify only plays full tracks
// in its own app. Spacing is tighter than web's so more songs fit a phone.
function SuggestionCard({ song, canLead, onAdd, onView, confidence }: Props) {
  function handleAddTap(event: GestureResponderEvent) {
    // A new add comes from "I know this song!", so it asks lead or support;
    // learning has its own link. Changing an existing role offers all three.
    showOptionsSheet({
      title: confidence ? song.title : `Add "${song.title}" as…`,
      anchor: anchorFrom(event),
      options: [
        { label: canLead ? 'Lead' : 'Lead (singers only)', disabled: !canLead, onPress: () => onAdd(song, 'lead') },
        { label: 'Support', onPress: () => onAdd(song, 'support') },
        ...(confidence ? [{ label: 'Learn', onPress: () => onAdd(song, 'learn') }] : []),
      ],
    });
  }

  function open(url: string) {
    Linking.openURL(url).catch(() => Alert.alert('Could not open link'));
  }

  const composersLabel = song.composers.length > 0
    ? formatComposers(song.composers, song.cultures)
    : null;
  const genres = [...song.genres].sort();
  const isLead = confidence === 'lead';

  return (
    <View className="mx-4 mb-2 rounded-2xl border border-zinc-200 bg-white p-4">
      <View className="flex-row items-start" style={{ gap: 8 }}>
        <TouchableOpacity onPress={() => onView(song)} className="flex-1 min-w-0">
          <Text numberOfLines={3}>
            <Text className="font-medium text-zinc-900">{song.title}</Text>
            {composersLabel ? (
              <Text className="text-zinc-400"> ({composersLabel})</Text>
            ) : null}
            {song.productions.length > 0 ? (
              <Text className="text-zinc-500"> — <Text className="italic">{song.productions.join(', ')}</Text></Text>
            ) : song.display_artist ? (
              <Text className="text-zinc-500"> — {song.display_artist}</Text>
            ) : null}
            {song.year ? <Text className="text-zinc-400"> ({song.year})</Text> : null}
          </Text>
        </TouchableOpacity>

        <View className="shrink-0 flex-row items-center">
          {song.youtube_id && (
            <TouchableOpacity
              onPress={() => open(`https://www.youtube.com/watch?v=${song.youtube_id}`)}
              className="rounded-lg p-1.5"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Watch on YouTube"
            >
              <Ionicons name="logo-youtube" size={18} color="#ef4444" />
            </TouchableOpacity>
          )}
          {song.spotify_track_id && (
            <TouchableOpacity
              onPress={() => open(`https://open.spotify.com/track/${song.spotify_track_id}`)}
              className="rounded-lg p-1.5"
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Play on Spotify"
            >
              <FontAwesome name="spotify" size={18} color="#22c55e" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {(genres.length > 0 || song.popularity > 0) && (
        <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 6 }}>
          {genres.map(g => (
            <View key={g} className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5">
              <Text className="text-xs text-zinc-500">{g}</Text>
            </View>
          ))}
          {song.popularity > 0 && (
            <Text className="text-xs text-zinc-400">
              {song.popularity} {song.popularity === 1 ? 'jammer' : 'jammers'}
            </Text>
          )}
        </View>
      )}

      <View className="mt-3 flex-row flex-wrap items-center" style={{ gap: 6 }}>
        {confidence ? (
          <>
            <View className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1.5">
              <Text className="text-sm text-amber-700">✓ In your repertoire</Text>
            </View>
            <TouchableOpacity
              onPress={handleAddTap}
              className={`flex-row items-center rounded-xl border px-2.5 py-1.5 ${
                isLead ? 'border-amber-400 bg-amber-100' : 'border-zinc-200 bg-white'
              }`}
            >
              <Text className={`text-sm ${isLead ? 'text-amber-800 font-semibold' : 'text-zinc-700'}`}>
                {CONFIDENCE_LABELS[confidence] ?? 'Learn'}
              </Text>
              <Ionicons name="chevron-down" size={12} color={isLead ? '#92400e' : '#71717a'} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity onPress={handleAddTap} className="rounded-xl bg-indigo-500 px-3 py-1.5">
              <Text className="text-sm font-medium text-white">I know this song!</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onAdd(song, 'learn')} className="px-1.5 py-1.5">
              <Text className="text-sm text-indigo-600">Want to learn it</Text>
            </TouchableOpacity>
          </>
        )}
        <TouchableOpacity onPress={() => onView(song)} className="rounded-xl border border-zinc-200 px-3 py-1.5">
          <Text className="text-sm text-zinc-600">View</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default memo(SuggestionCard);
