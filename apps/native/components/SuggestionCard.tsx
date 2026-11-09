import { memo } from 'react';
import { View, Text, TouchableOpacity, Pressable, Alert, Linking } from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import CreditText from '@/components/CreditText';
import { browsePath, productionCredits, songCardCredits, songCardPills, type CardIdentity, type ProductionCredit, type RecordingArtistCredit } from '@singjam/core';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';

export type Suggestion = {
  song_id: string;
  title: string;
  display_artist: string | null;
  byline?: string | null;
  card_identity?: CardIdentity;
  first_line: string | null;
  slug: string | null;
  composers: string[];
  cultures: string[];
  communities?: string[];
  productions: string[];
  genres: string[];
  forms?: string[];
  occasions?: string[];
  languages: string[];
  year: number | null;
  popularity: number;
  youtube_id: string | null;
  spotify_track_id: string | null;
  recording_artists?: RecordingArtistCredit[] | null;
  production_credits?: ProductionCredit[] | null;
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
  onAdd: (song: Suggestion, confidence: string) => void;
  onView: (song: Suggestion) => void;
  // Set when the song is already in the user's repertoire: the Add button is
  // replaced by web's "✓ In your repertoire" pill plus a role control.
  confidence?: string | null;
  // One extra line for where the card appears (a songwriter's role, …).
  context?: string | null;
  // Opens a browse page (web path); without it the pills aren't tappable.
  onOpenBrowse?: (webPath: string) => void;
};

// Mirrors web's SongCard: title + (songwriters), then how the song is known
// ("from <production>", its tradition, or its recordings), media links, up to
// three "what it is" pills (songCardPills) + how many know it, then Add. Web embeds the
// YouTube and Spotify players inline; here they open the apps instead, since a
// WebView per row would hurt list scrolling and Spotify only plays full tracks
// in its own app. Spacing is tighter than web's so more songs fit a phone.
function SuggestionCard({ song, onAdd, onView, confidence, context, onOpenBrowse }: Props) {
  function handleAddTap(event: GestureResponderEvent) {
    // A new add comes from "I know this song!", so it asks lead or support;
    // learning has its own link. Changing an existing role offers all three.
    showOptionsSheet({
      title: confidence ? song.title : `Add "${song.title}" as…`,
      anchor: anchorFrom(event),
      options: [
        { label: 'Lead', onPress: () => onAdd(song, 'lead') },
        { label: 'Support', onPress: () => onAdd(song, 'support') },
        ...(confidence ? [{ label: 'Learn', onPress: () => onAdd(song, 'learn') }] : []),
      ],
    });
  }

  function open(url: string) {
    Linking.openURL(url).catch(() => Alert.alert('Could not open link'));
  }

  const credits = songCardCredits({
    title: song.title,
    identity: song.card_identity,
    byline: song.byline,
    displayArtist: song.display_artist,
    composers: song.composers,
    cultures: song.cultures,
    recordingArtists: song.recording_artists,
  });
  const shows = productionCredits(song.production_credits, song.productions);
  const pills = songCardPills({ forms: song.forms, occasions: song.occasions, genres: song.genres, communities: song.communities, languages: song.languages });
  const isLead = confidence === 'lead';

  return (
    // The whole card opens the song; its buttons and pills handle their own taps.
    <Pressable onPress={() => onView(song)} className="mx-4 mb-2 rounded-2xl border border-zinc-200 bg-white p-4">
      <View className="flex-row items-start" style={{ gap: 8 }}>
        <View className="flex-1 min-w-0">
          <Text numberOfLines={3}>
            <Text className="font-medium text-zinc-900">{song.title}</Text>
            {credits.writers.length > 0 ? (
              <Text className="text-zinc-400"> (<CreditText credits={credits.writers} onOpen={onOpenBrowse} />)</Text>
            ) : null}
          </Text>
          {shows.length > 0 ? (
            <Text className="text-sm text-zinc-500">
              from{' '}
              {shows.map((p, i) => (
                <Text key={`${p.name}-${p.year}`}>
                  {i > 0 ? ', ' : null}
                  <Text className="italic" onPress={p.slug && onOpenBrowse ? () => onOpenBrowse(browsePath('show', p.slug!)) : undefined}>{p.name}</Text>
                  {p.year ? ` (${p.year})` : null}
                </Text>
              ))}
              {credits.line.length > 0 ? <Text>{' · '}<CreditText credits={credits.line} onOpen={onOpenBrowse} /></Text> : null}
            </Text>
          ) : credits.line.length > 0 ? (
            <Text className="text-sm text-zinc-500"><CreditText credits={credits.line} onOpen={onOpenBrowse} /></Text>
          ) : null}
          {context ? <Text className="text-xs text-zinc-500">{context}</Text> : null}
        </View>

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

      {(pills.length > 0 || song.popularity > 0) && (
        <View className="mt-2 flex-row flex-wrap items-center" style={{ gap: 6 }}>
          {pills.map(p => (
            <TouchableOpacity
              key={`${p.type}:${p.name}`}
              disabled={!onOpenBrowse}
              onPress={() => onOpenBrowse?.(browsePath(p.type, p.slug))}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5"
            >
              <Text className="text-xs text-zinc-500">{p.name}</Text>
            </TouchableOpacity>
          ))}
          {song.popularity > 0 && (
            <Text className="text-xs text-zinc-400">
              {song.popularity} know{song.popularity === 1 ? 's' : ''} it
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
              className={`flex-row items-center rounded-full border px-2.5 py-1.5 ${
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
            <TouchableOpacity onPress={handleAddTap} className="rounded-full border border-indigo-500 bg-indigo-500 px-3 py-1.5">
              <Text className="text-sm font-medium text-white">I know this song!</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onAdd(song, 'learn')} className="rounded-full border border-indigo-200 bg-white px-3 py-1.5">
              <Text className="text-sm font-medium text-indigo-600">Want to learn it</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </Pressable>
  );
}

export default memo(SuggestionCard);
