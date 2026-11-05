import { isOfficialYouTubeUpload } from "@singjam/core";
import { getSpotifyToken } from "@/lib/spotify";

const REISSUE_SUFFIX = /\s+-\s+.*(remaster|version|mono|stereo|edit|mix|live).*$|\s*\((?:[^)]*(remaster|version|mono|stereo|edit|mix))[^)]*\)/i;

export type SpotifyMatch = { title: string; artist: string; spotify_url: string; release_year: number | null };

export async function findOnSpotify(title: string, artist: string): Promise<SpotifyMatch | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  const q = artist ? `track:${title} artist:${artist}` : `track:${title}`;
  const res = await fetch(`https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const items: any[] = (await res.json()).tracks?.items ?? [];
  // Prefer the original album or single over a compilation of the same track.
  const track = [...items].sort((a, b) => (a.album?.album_type === "compilation" ? 1 : 0) - (b.album?.album_type === "compilation" ? 1 : 0))[0];
  if (!track) return null;
  return {
    title: track.name.replace(REISSUE_SUFFIX, "").trim(),
    artist: track.artists?.[0]?.name ?? artist,
    spotify_url: track.external_urls?.spotify,
    release_year: parseInt(track.album?.release_date?.slice(0, 4)) || null,
  };
}

// One search (100 of the 10,000 free daily units). The preview can be any music
// video; only an official upload is kept as the recording's link.
export async function findOnYouTube(title: string, artist: string) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;
  const q = encodeURIComponent(`${artist} ${title}`);
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${q}&key=${key}`);
  if (!res.ok) return null;
  const items: any[] = (await res.json()).items ?? [];
  const official = items.find((v) => isOfficialYouTubeUpload(v.snippet, title, artist));
  const pick = official ?? items[0];
  return pick ? { youtube_id: pick.id.videoId as string, youtube_official: !!official } : null;
}
