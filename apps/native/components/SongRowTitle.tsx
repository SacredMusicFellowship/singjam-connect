import { Text, View } from 'react-native';
import { songRowText, type CardIdentity, type RecordingArtistCredit } from '@singjam/core';

export type SongRowCard = {
  byline?: string | null;
  composers?: string[] | null;
  cultures?: string[] | null;
  recording_artists?: RecordingArtistCredit[] | null;
  card_identity?: CardIdentity;
};

// A compact song row's title and second line, by the same rules as song cards
// (web's SongRowTitle): writers in brackets; recordings, or what identifies the song, underneath.
export default function SongRowTitle({ title, displayArtist, productions, card }: {
  title: string;
  displayArtist: string | null;
  productions?: string[] | null;
  card: SongRowCard;
}) {
  const { writers, shows, credits } = songRowText({
    title,
    byline: card.byline,
    displayArtist,
    composers: card.composers ?? [],
    cultures: card.cultures ?? [],
    recordingArtists: card.recording_artists,
    identity: card.card_identity,
    productions,
  });
  return (
    <View>
      <Text numberOfLines={2}>
        <Text className="text-zinc-900 font-medium">{title}</Text>
        {writers ? <Text className="text-zinc-400">{` (${writers})`}</Text> : null}
      </Text>
      <SongRowLine shows={shows} credits={credits} className="text-zinc-400 text-sm mt-0.5" />
    </View>
  );
}

// A row's second line with its show titles in italics.
export function SongRowLine({ shows, credits, className, empty }: { shows: string[]; credits: string; className: string; empty?: string }) {
  if (!shows.length && !credits) return empty ? <Text className={className} numberOfLines={1}>{empty}</Text> : null;
  return (
    <Text className={className} numberOfLines={1}>
      {shows.length > 0 ? <>from <Text className="italic">{shows.join(', ')}</Text>{credits ? ' · ' : ''}</> : null}
      {credits}
    </Text>
  );
}
