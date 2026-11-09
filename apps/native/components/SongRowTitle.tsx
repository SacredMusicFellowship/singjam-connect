import { Text, View } from 'react-native';
import { songCardCredits, type CardIdentity, type RecordingArtistCredit } from '@singjam/core';

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
  const credits = songCardCredits({
    title,
    byline: card.byline,
    displayArtist,
    composers: card.composers ?? [],
    cultures: card.cultures ?? [],
    recordingArtists: card.recording_artists,
    identity: card.card_identity,
  });
  const text = (list: typeof credits.line) => list.map((c) => `${c.lead ?? ''}${c.text}${c.suffix ?? ''}`).join(', ');
  const shows = (productions ?? []).filter(Boolean);
  const second = shows.length ? `from ${shows.join(', ')}${credits.line.length ? ` · ${text(credits.line)}` : ''}` : text(credits.line);
  return (
    <View>
      <Text numberOfLines={2}>
        <Text className="text-zinc-900 font-medium">{title}</Text>
        {credits.writers.length > 0 ? <Text className="text-zinc-400">{` (${text(credits.writers)})`}</Text> : null}
      </Text>
      {second ? <Text className="text-zinc-400 text-sm mt-0.5" numberOfLines={1}>{second}</Text> : null}
    </View>
  );
}
