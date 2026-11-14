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
    <div className="min-w-0">
      <div className="text-sm">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-zinc-900 hover:underline">{title}</a>
        ) : (
          <span className="font-medium text-zinc-900">{title}</span>
        )}
        {writers && <span className="ml-1 text-zinc-400">({writers})</span>}
      </div>
      <SongRowLine shows={shows} credits={credits} className="truncate text-xs text-zinc-500" />
    </div>
  );
}

// A row's second line with its show titles in italics.
export function SongRowLine({ shows, credits, className, empty }: { shows: string[]; credits: string; className: string; empty?: string }) {
  if (!shows.length && !credits) return empty ? <div className={className}>{empty}</div> : null;
  return (
    <div className={className}>
      {shows.length > 0 && <>from <i>{shows.join(", ")}</i>{credits && " · "}</>}
      {credits}
    </div>
  );
}
