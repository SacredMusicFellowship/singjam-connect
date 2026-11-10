import type { SupabaseClient } from "@supabase/supabase-js";
import { isOfficialYouTubeUpload, youTubeVideoId } from "@singjam/core";

type Row = {
  song_id: string;
  artist_id: string;
  youtube_url: string | null;
  recorded_title: string | null;
  songs: { title: string; song_alternate_titles: { title: string }[] | null } | null;
  artists: { name: string } | null;
};

export type YouTubeBackfillResult = { verified: number; searched: number; found: number; quotaExceeded: boolean };

const RETRY_AFTER_DAYS = 90;

// Every name the video may use: the title on this record ("Erie Canal"), the
// song's title ("Low Bridge") and its alternate titles.
const titlesOf = (r: Row) =>
  [r.recorded_title, r.songs?.title, ...(r.songs?.song_alternate_titles ?? []).map((a) => a.title)].filter((t): t is string => !!t);

async function youtube(path: string, apiKey: string) {
  const res = await fetch(`https://www.googleapis.com/youtube/v3/${path}&key=${apiKey}`);
  const json = await res.json();
  const quotaExceeded = (json.error?.errors ?? []).some((e: { reason?: string }) => e.reason === "quotaExceeded");
  if (json.error && !quotaExceeded) throw new Error(`YouTube API: ${json.error.message}`);
  return { json, quotaExceeded };
}

// Each run first checks links nobody has checked yet (videos.list: 1 quota unit per
// 50 videos), then searches for a few recordings with no link or a link that
// fails the official-upload rule (search: 100 units each). The free daily quota is
// 10,000 units and set-list YouTube playlists share it, so searches stay capped.
export async function runYouTubeBackfill(
  admin: SupabaseClient,
  apiKey: string,
  { verifyLimit = 50, searchLimit = 3 }: { verifyLimit?: number; searchLimit?: number } = {},
): Promise<YouTubeBackfillResult> {
  const result: YouTubeBackfillResult = { verified: 0, searched: 0, found: 0, quotaExceeded: false };
  const select = "song_id, artist_id, youtube_url, recorded_title, songs(title, song_alternate_titles(title)), artists(name)";

  const { data: unchecked, error: uncheckedError } = await admin
    .from("song_recording_artists")
    .select(select)
    .not("youtube_url", "is", null)
    .is("youtube_ok", null)
    .order("song_id")
    .order("artist_id")
    .limit(verifyLimit);
  if (uncheckedError) throw uncheckedError;
  const toVerify = (unchecked ?? []) as unknown as Row[];
  if (toVerify.length) {
    const ids = toVerify.map((r) => youTubeVideoId(r.youtube_url)).filter(Boolean);
    const { json, quotaExceeded } = await youtube(`videos?part=snippet&id=${ids.join(",")}`, apiKey);
    if (quotaExceeded) return { ...result, quotaExceeded };
    const byId = new Map<string, { title: string; channelTitle: string }>(
      (json.items ?? []).map((v: { id: string; snippet: { title: string; channelTitle: string } }) => [v.id, v.snippet])
    );
    for (const r of toVerify) {
      const snippet = byId.get(youTubeVideoId(r.youtube_url) ?? "");
      const ok = !!snippet && !!r.songs && !!r.artists && isOfficialYouTubeUpload(snippet, titlesOf(r), r.artists.name);
      await admin
        .from("song_recording_artists")
        .update(snippet ? { youtube_ok: ok } : { youtube_url: null, youtube_ok: null })
        .eq("song_id", r.song_id)
        .eq("artist_id", r.artist_id);
      result.verified++;
    }
  }

  const retryBefore = new Date(Date.now() - RETRY_AFTER_DAYS * 86_400_000).toISOString();
  const { data: candidates, error: candidatesError } = await admin
    .from("song_recording_artists")
    .select(select)
    .or(
      [
        "and(youtube_url.is.null,youtube_checked_at.is.null)",
        `and(youtube_url.is.null,youtube_checked_at.lt.${retryBefore})`,
        "and(youtube_ok.eq.false,youtube_checked_at.is.null)",
        `and(youtube_ok.eq.false,youtube_checked_at.lt.${retryBefore})`,
      ].join(",")
    )
    .order("youtube_url", { ascending: true, nullsFirst: true })
    .order("position", { ascending: true, nullsFirst: false })
    .order("song_id")
    .order("artist_id")
    .limit(searchLimit);
  if (candidatesError) throw candidatesError;

  for (const r of (candidates ?? []) as unknown as Row[]) {
    if (!r.songs || !r.artists) continue;
    const q = encodeURIComponent(`${r.artists.name} ${r.recorded_title ?? r.songs.title}`);
    const { json, quotaExceeded } = await youtube(`search?part=snippet&type=video&videoCategoryId=10&maxResults=10&q=${q}`, apiKey);
    if (quotaExceeded) return { ...result, quotaExceeded };
    result.searched++;
    const match = (json.items ?? []).find((v: { snippet: { title: string; channelTitle: string } }) =>
      isOfficialYouTubeUpload(v.snippet, titlesOf(r), r.artists!.name)
    );
    const checkedAt = new Date().toISOString();
    await admin
      .from("song_recording_artists")
      .update(
        match
          ? { youtube_url: `https://www.youtube.com/watch?v=${match.id.videoId}`, youtube_ok: true, youtube_checked_at: checkedAt }
          : { youtube_checked_at: checkedAt }
      )
      .eq("song_id", r.song_id)
      .eq("artist_id", r.artist_id);
    if (match) result.found++;
  }

  return result;
}
