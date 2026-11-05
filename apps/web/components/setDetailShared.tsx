export { MUSICAL_KEYS } from "@singjam/core";

// A participant's role for a set song, plus the key they play it in.
export type SongKnowledge = { user_id: string; song_id: string; confidence: string; key_note: string | null };

export type Song = {
  id: string;
  song_id: string;
  position: number;
  key_note: string | null;
  notes: string | null;
  played: boolean;
  leader_user_ids: string[];
  added_by_user_id?: string | null;
  songs: {
    title: string;
    display_artist: string | null;
    slug: string | null;
    chord_chart_url: string | null;
    youtube_url: string | null;
    tonality: string | null;
    year: number | null;
    meter: string | null;
    song_composers: { people: { name: string } | null }[];
    song_lyricists: { people: { name: string } | null }[];
    song_cultures: { cultures: { name: string } | null; context: string | null }[];
    song_genres: { genres: { name: string } | null }[];
    song_themes: { themes: { name: string } | null }[];
    song_recording_artists: { position: number; youtube_url: string | null; spotify_url: string | null }[];
  };
};

export type Participant = {
  user_id: string;
  display_name: string | null;
  last_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

export type Collaborator = {
  id: string;
  user_id: string | null;
  status: string;
  role: "editor" | "viewer" | "co-owner";
  profiles: { display_name: string | null; last_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export type PlaylistLink = { url: string; added?: number; total?: number };

export type SetData = {
  id: string;
  name: string;
  description: string | null;
  owner_user_id: string;
  jam_id: string | null;
  link_sharing: "private" | "link" | "public";
  youtube_playlist_id: string | null;
  youtube_playlist_fingerprint: string | null;
  spotify_playlist_id: string | null;
  spotify_playlist_fingerprint: string | null;
  ultimate_guitar_playlist_url: string | null;
  profiles: { display_name: string | null; last_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export const CSV_COLUMN_OPTIONS = [
  { key: "artist",   label: "Artist" },
  { key: "year",     label: "Year" },
  { key: "tonality", label: "Tonality" },
  { key: "meter",    label: "Meter" },
  { key: "key",      label: "Key (set)" },
  { key: "leader",   label: "Leader" },
  { key: "songwriters", label: "Songwriters" },
  { key: "genres",      label: "Genres" },
  { key: "themes",      label: "Themes" },
  { key: "singjam",     label: "SingJam link" },
  { key: "youtube",     label: "YouTube link" },
  { key: "spotify",  label: "Spotify link" },
  { key: "chords",   label: "Chord chart link" },
] as const;

export type CsvColumnKey = typeof CSV_COLUMN_OPTIONS[number]["key"];

export function getYoutubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      return u.searchParams.get("v")
        ?? u.pathname.match(/\/(?:embed|v|shorts)\/([^/?]+)/)?.[1]
        ?? null;
    }
    return null;
  } catch { return null; }
}

export function YoutubeIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export function SpotifyIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
    </svg>
  );
}

export function UltimateGuitarIcon() {
  return (
    <svg className="h-5 w-5 rounded-sm" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M892 88H308C186.498 88 88 186.498 88 308V892C88 1013.5 186.498 1112 308 1112H892C1013.5 1112 1112 1013.5 1112 892V308C1112 186.498 1013.5 88 892 88Z" fill="#111111"/>
      <path d="M291.02 280.202L356.294 463.987C375.375 409.765 425.595 348.494 507.938 348.494C594.301 348.494 647.532 411.755 657.573 481.057H794.152L858.425 232L706.782 310.342C670.621 280.221 623.411 263.132 572.209 263.132C502.907 263.132 451.715 291.252 417.554 329.413L291.02 280.202Z" fill="#FFD609"/>
      <path d="M562.169 646.76L913.66 481.057V780.327L840.349 752.208C799.167 877.732 704.783 967.12 560.159 967.12C399.474 967.12 287 841.576 287 687.931C287 642.73 296.046 605.588 312.107 569.428H314.115C305.075 598.549 301.06 624.658 301.06 655.799C301.06 777.322 393.455 868.702 512.959 868.702C619.422 868.702 687.693 794.375 719.834 707.012L562.169 646.76Z" fill="#FFD609"/>
    </svg>
  );
}

export function getPrimaryYoutubeId(song: Song["songs"]): string | null {
  const fromArtists = [...(song.song_recording_artists ?? [])]
    .sort((a, b) => a.position - b.position)
    .find((a) => a.youtube_url)?.youtube_url;
  return getYoutubeId(fromArtists) ?? getYoutubeId(song.youtube_url);
}

export function getPrimarySpotifyUrl(song: Song["songs"]): string | null {
  return [...(song.song_recording_artists ?? [])]
    .sort((a, b) => a.position - b.position)
    .find((a) => a.spotify_url)?.spotify_url ?? null;
}

export function getSpotifyTrackId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const match = new URL(url).pathname.match(/\/track\/([a-zA-Z0-9]+)/);
    return match?.[1] ?? null;
  } catch { return null; }
}
