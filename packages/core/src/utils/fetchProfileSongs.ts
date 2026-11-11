import { fetchAllRows } from "./fetchAllRows";

export type ProfileSong = {
  song_id: string;
  title: string;
  display_artist: string | null;
  // How the song is known (byline, migration 204): show this, not display_artist.
  byline: string | null;
  confidence: string | null;
  slug: string | null;
};

export async function fetchProfileSongs(
  supabase: any,
  profileId: string
): Promise<{
  sharedSongs: ProfileSong[];
  additionalSongs: ProfileSong[];
  wantsToLearnSongs: ProfileSong[];
}> {
  const [{ data: shared }, theirSongs] = await Promise.all([
    supabase.rpc("shared_songs_with", { other_user_id: profileId }),
    fetchAllRows<{ song_id: string; confidence: string | null }>((f: number, t: number) =>
      supabase.from("user_songs").select("song_id, confidence").eq("user_id", profileId).order("song_id").range(f, t)
    ),
  ]);

  const confidenceMap = new Map(
    theirSongs.map((r: any) => [r.song_id, r.confidence])
  );

  const sharedIdList = (shared ?? []).map((s: any) => s.song_id as string);
  const { data: sharedBylines } = sharedIdList.length
    ? await supabase.rpc("song_bylines", { p_song_ids: sharedIdList })
    : { data: [] };
  const bylineById = new Map<string, string | null>((sharedBylines ?? []).map((s: any) => [s.song_id, s.byline ?? null]));

  const sharedSongs: ProfileSong[] = (shared ?? []).map((s: any) => ({
    song_id: s.song_id as string,
    title: s.title as string,
    display_artist: (s.display_artist ?? null) as string | null,
    byline: bylineById.get(s.song_id) ?? null,
    confidence: (confidenceMap.get(s.song_id) ?? null) as string | null,
    slug: (s.slug ?? null) as string | null,
  }));

  const sharedIds = new Set(sharedSongs.map((s) => s.song_id));
  const additionalIds = theirSongs
    .filter((r: any) => !sharedIds.has(r.song_id) && r.confidence !== "learn")
    .map((r: any) => r.song_id as string);
  const wantsToLearnIds = theirSongs
    .filter((r: any) => r.confidence === "learn")
    .map((r: any) => r.song_id as string);

  let additionalSongs: ProfileSong[] = [];
  let wantsToLearnSongs: ProfileSong[] = [];
  const otherIds = [...additionalIds, ...wantsToLearnIds];
  if (otherIds.length > 0) {
    // In chunks: hundreds of ids in one URL is too long.
    const chunks: string[][] = [];
    for (let i = 0; i < otherIds.length; i += 200) chunks.push(otherIds.slice(i, i + 200));
    const songDetails = (await Promise.all(chunks.map(async (ids) => {
      const { data, error } = await supabase.from("songs").select("id, title, display_artist, byline, slug").in("id", ids);
      if (error) throw error;
      return data ?? [];
    }))).flat();
    const detailsMap = new Map<string, any>(
      (songDetails ?? []).map((s: any) => [s.id, s])
    );

    const toProfileSong = (id: string): ProfileSong | null => {
      const s = detailsMap.get(id);
      if (!s) return null;
      return {
        song_id: s.id as string,
        title: s.title as string,
        display_artist: (s.display_artist ?? null) as string | null,
        byline: (s.byline ?? null) as string | null,
        confidence: (confidenceMap.get(s.id) ?? null) as string | null,
        slug: (s.slug ?? null) as string | null,
      };
    };

    additionalSongs = additionalIds
      .map(toProfileSong)
      .filter((s: ProfileSong | null): s is ProfileSong => s !== null)
      .sort((a: ProfileSong, b: ProfileSong) => a.title.localeCompare(b.title));
    wantsToLearnSongs = wantsToLearnIds
      .map(toProfileSong)
      .filter((s: ProfileSong | null): s is ProfileSong => s !== null)
      .sort((a: ProfileSong, b: ProfileSong) => a.title.localeCompare(b.title));
  }

  return { sharedSongs, additionalSongs, wantsToLearnSongs };
}
