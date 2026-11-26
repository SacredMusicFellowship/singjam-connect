export type RecordingLink =
  | { kind: "youtube"; id: string; url: string }
  | { kind: "spotify"; trackId: string; url: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

// A YouTube video or Spotify track someone pasted, in any of the usual shapes
// (watch, youtu.be, shorts, embed, music.youtube; open.spotify.com with or
// without a locale, spotify:track:), as one canonical link.
export function parseRecordingLink(input: string | null | undefined): RecordingLink | null {
  const raw = input?.trim();
  if (!raw) return null;
  const uri = raw.match(/^spotify:track:([A-Za-z0-9]+)$/);
  if (uri) return spotifyLink(uri[1]);
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
  const parts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") return youtubeLink(parts[0]);
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (parts[0] === "watch") return youtubeLink(url.searchParams.get("v"));
    if (["shorts", "embed", "live", "v"].includes(parts[0])) return youtubeLink(parts[1]);
    return null;
  }
  if (host === "open.spotify.com") {
    const at = parts.indexOf("track");
    return at >= 0 ? spotifyLink(parts[at + 1]) : null;
  }
  return null;
}

function youtubeLink(id: string | null | undefined): RecordingLink | null {
  return id && YOUTUBE_ID.test(id) ? { kind: "youtube", id, url: `https://www.youtube.com/watch?v=${id}` } : null;
}

function spotifyLink(id: string | null | undefined): RecordingLink | null {
  return id && SPOTIFY_ID.test(id) ? { kind: "spotify", trackId: id, url: `https://open.spotify.com/track/${id}` } : null;
}
