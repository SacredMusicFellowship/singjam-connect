import { songRowText, type CardIdentity, type RecordingArtistCredit } from "@singjam/core";

export type SongRowCard = {
  byline?: string | null;
  composers?: string[] | null;
  cultures?: string[] | null;
  recording_artists?: RecordingArtistCredit[] | null;
  card_identity?: CardIdentity;
};

// A compact song row's title and second line, by the same rules as song cards
// (writers in brackets; recordings, or what identifies the song, underneath),
// without recording years.
// Plain text: in a list where tapping adds the song, names don't navigate.
export default function SongRowTitle({ title, href, displayArtist, productions, card }: {
  title: string;
  href?: string | null;
  displayArtist: string | null;
  productions?: string[] | null;
  card: SongRowCard;
}) {
  const { writers, line: second } = songRowText({
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
    <div className="min-w-0">
      <div className="text-sm">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-900 hover:underline">{title}</a>
        ) : (
          <span className="font-medium text-zinc-900">{title}</span>
        )}
        {writers && <span className="ml-1 text-zinc-400">({writers})</span>}
      </div>
      {second && <div className="truncate text-xs text-zinc-500">{second}</div>}
    </div>
  );
}
