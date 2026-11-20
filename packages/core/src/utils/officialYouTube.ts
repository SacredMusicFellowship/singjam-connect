const squash = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");

const words = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[’'‘`]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const NOT_THE_RECORDING = /\b(live|cover|karaoke|instrumental|reaction|tutorial|lesson|remix|8d|slowed|sped up|nightcore)\b/;

// A recording's YouTube link must be the artist's own upload: their channel, its
// auto-generated "<Artist> - Topic" channel, or its VEVO channel — and the video
// title must name the song (by any of its titles: "Erie Canal" is how Pete
// Seeger's record names "Low Bridge"). Covers, live cuts and fan uploads don't qualify.
export function isOfficialYouTubeUpload(
  video: { title: string; channelTitle: string },
  songTitle: string | string[],
  artistName: string,
): boolean {
  if (Array.isArray(songTitle)) return songTitle.some((t) => isOfficialYouTubeUpload(video, t, artistName));
  const artist = squash(artistName).replace(/^the/, "");
  const channel = squash(video.channelTitle).replace(/^the/, "");
  if (!artist) return false;
  const channelOk = [artist, `${artist}topic`, `${artist}vevo`, `${artist}official`].includes(channel);
  if (!channelOk) return false;
  const title = words(video.title);
  const titleWords = new Set(title.split(" "));
  const songWords = words(songTitle).split(" ").filter((w) => w && w !== "the");
  if (!songWords.length || !songWords.every((w) => titleWords.has(w))) return false;
  const extra = title.split(" ").filter((w) => !songWords.includes(w)).join(" ");
  return !NOT_THE_RECORDING.test(extra) || NOT_THE_RECORDING.test(songWords.join(" "));
}

export function youTubeVideoId(url: string | null | undefined): string | null {
  return url?.match(/(?:youtu\.be\/|[?&]v=|\/(?:embed|v|shorts)\/)([a-zA-Z0-9_-]{11})/)?.[1] ?? null;
}
