import { Pressable, Text, View } from 'react-native';
import { songRowText, type SongMelodyItem } from '@singjam/core';

const ROLE_LABEL: Record<string, string> = { lead: 'Lead', support: 'Support', learn: 'Learn' };

// One of the song page's melody lists (song_melodies, migration 220), as on
// web's SongMelodies: the same words to other tunes, or other songs sung to this tune.
export default function SongMelodies({ title, items, onOpen }: {
  title: string;
  items: SongMelodyItem[];
  onOpen: (songId: string) => void;
}) {
  if (!items.length) return null;
  return (
    <View className="px-4 py-4 border-b border-slate-100">
      <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">{title}</Text>
      {items.map((it, i) => {
        const row = songRowText({
          title: it.title,
          byline: it.card?.byline,
          displayArtist: it.display_artist,
          composers: it.card?.composers ?? [],
          cultures: it.card?.cultures ?? [],
          recordingArtists: it.card?.recording_artists,
          identity: it.card?.card_identity,
        });
        return (
          <Pressable
            key={it.song_id}
            onPress={() => onOpen(it.song_id)}
            className={`flex-row items-start justify-between gap-3 py-2 ${i > 0 ? 'border-t border-slate-100' : ''}`}
          >
            <View className="flex-1 min-w-0">
              <Text numberOfLines={2}>
                <Text className="text-zinc-900 font-medium">{it.title}</Text>
                {row.writers ? <Text className="text-zinc-400">{` (${row.writers})`}</Text> : null}
              </Text>
              {row.line ? <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>{row.line}</Text> : null}
            </View>
            {it.viewer_confidence ? (
              <View className="rounded-full bg-amber-50 px-2.5 py-0.5">
                <Text className="text-xs font-medium text-amber-800">{ROLE_LABEL[it.viewer_confidence] ?? it.viewer_confidence}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
