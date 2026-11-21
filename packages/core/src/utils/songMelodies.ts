import type { CardIdentity } from "./songSubtitle";
import type { RecordingArtistCredit } from "./formatRecordingArtists";

// song_melodies(song), migration 220: one song per melody, so a song's other
// melodies are the songs that share its words, and songs sharing its tune are
// sung to the same melody.
export type SongMelodyItem = {
  song_id: string;
  slug: string | null;
  title: string;
  display_artist: string | null;
  tune: string | null;
  tune_slug: string | null;
  viewer_confidence: string | null;
  card: {
    byline?: string | null;
    composers?: string[] | null;
    cultures?: string[] | null;
    recording_artists?: RecordingArtistCredit[] | null;
    card_identity?: CardIdentity;
  } | null;
};

export type SongMelodies = {
  other_melodies: SongMelodyItem[];
  same_tune: SongMelodyItem[];
  known_tune: { title: string; slug: string | null; confidence: string } | null;
};

export const NO_MELODIES: SongMelodies = { other_melodies: [], same_tune: [], known_tune: null };

// "You know the tune" shows only while the song isn't in the viewer's songs.
// It is a hint with one tap to add the song as Lead, and never counts in matching.
export function knownTuneHint(melodies: SongMelodies | null, viewerConfidence: string | null) {
  return !viewerConfidence && melodies?.known_tune ? melodies.known_tune : null;
}
