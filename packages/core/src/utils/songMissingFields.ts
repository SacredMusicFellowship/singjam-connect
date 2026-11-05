export type SongCompleteness = {
  display_artist: string | null;
  first_line: string | null;
  hook: string | null;
  genius_url: string | null;
  chord_chart_url: string | null;
  tonality: string | null;
  meter: string | null;
  vibe: string | null;
  youtube_url: string | null;
  song_composers: unknown[];
  song_lyricists: unknown[];
  song_recording_artists: { youtube_url: string | null }[];
  song_genres: unknown[];
  song_languages: unknown[];
};

export const SONG_COMPLETENESS_FIELDS = [
  "composer", "lyricist", "artist", "recording", "first line", "hook", "genius",
  "tonality", "meter", "genre", "language", "vibe", "chord chart", "video",
] as const;

// What a person would still have to fill in by hand — the admin Songs table and
// "Recently added" both show this.
export function songMissingFields(s: SongCompleteness): string[] {
  const missing: string[] = [];
  if (!s.song_composers.length) missing.push("composer");
  if (!s.song_lyricists.length) missing.push("lyricist");
  if (!s.display_artist) missing.push("artist");
  if (!s.song_recording_artists.length) missing.push("recording");
  if (!s.first_line) missing.push("first line");
  if (!s.hook) missing.push("hook");
  if (!s.genius_url) missing.push("genius");
  if (!s.tonality) missing.push("tonality");
  if (!s.meter) missing.push("meter");
  if (!s.song_genres.length) missing.push("genre");
  if (!s.song_languages.length) missing.push("language");
  if (!s.vibe) missing.push("vibe");
  if (!s.chord_chart_url) missing.push("chord chart");
  if (!s.youtube_url && !s.song_recording_artists.some((a) => a.youtube_url)) missing.push("video");
  return missing;
}
