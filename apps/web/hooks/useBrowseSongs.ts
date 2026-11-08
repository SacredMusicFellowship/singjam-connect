import type { ProductionCredit, RecordingArtistCredit } from "@singjam/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { browseRpcParams, type BrowseFilters } from "@/lib/browseSongsParams";

export type { BrowseFilters } from "@/lib/browseSongsParams";

export type BrowseSong = {
  song_id: string;
  title: string;
  slug: string | null;
  display_artist: string | null;
  composers: string[];
  cultures: string[];
  productions: string[];
  genres: string[];
  languages: string[];
  themes: string[];
  forms: string[];
  occasions: string[];
  communities: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
  popularity: number;
  youtube_id: string | null;
  spotify_track_id: string | null;
  recording_artists?: RecordingArtistCredit[] | null;
  production_credits?: ProductionCredit[] | null;
  total_count: number;
};

const MAX_RPC_ROWS = 200;

export function firstLoadPages(limit: number): { offset: number; limit: number }[] {
  const pages = [];
  for (let offset = 0; offset < limit; offset += MAX_RPC_ROWS) pages.push({ offset, limit: Math.min(MAX_RPC_ROWS, limit - offset) });
  return pages;
}

export function useBrowseSongs(
  filters: BrowseFilters,
  { pageSize = 20, initialCount = pageSize }: { pageSize?: number; initialCount?: number } = {}
) {
  const supabase = useRef(supabaseBrowser()).current;
  const [songs, setSongs] = useState<BrowseSong[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeq = useRef(0);
  const isFirstLoad = useRef(true);
  const songsRef = useRef(songs);
  songsRef.current = songs;

  const filtersKey = useMemo(() => JSON.stringify(filters), [filters]);

  useEffect(() => {
    const seq = ++requestSeq.current;
    const f = JSON.parse(filtersKey) as BrowseFilters;
    const limit = isFirstLoad.current ? Math.max(initialCount, pageSize) : pageSize;
    isFirstLoad.current = false;
    setLoading(true);
    setLoadingMore(false);
    // browse_songs caps a page at 200 rows, so a return visit that had scrolled
    // further reloads in 200-row pages, all at once.
    Promise.all(
      firstLoadPages(limit).map((p) => supabase.rpc("browse_songs", browseRpcParams(f, p.offset, p.limit)))
    ).then((pages) => {
      if (seq !== requestSeq.current) return;
      setLoading(false);
      if (pages.some((p) => p.error)) {
        setError("Could not load songs. Please try again.");
        setSongs([]);
        setTotal(null);
        return;
      }
      const rows = pages.flatMap((p) => (p.data ?? []) as BrowseSong[]);
      setError(null);
      setSongs(rows);
      setTotal(rows[0]?.total_count ?? 0);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey]);

  const hasMore = total !== null && songs.length < total;

  const loadMore = useCallback(() => {
    if (loading || loadingMore || !hasMore) return;
    const seq = requestSeq.current;
    const f = JSON.parse(filtersKey) as BrowseFilters;
    setLoadingMore(true);
    supabase.rpc("browse_songs", browseRpcParams(f, songs.length, pageSize)).then(({ data, error: rpcError }) => {
      if (seq !== requestSeq.current) return;
      setLoadingMore(false);
      if (rpcError) {
        setError("Could not load more songs. Please try again.");
        return;
      }
      const rows = (data ?? []) as BrowseSong[];
      setSongs((prev) => [...prev, ...rows]);
      if (rows[0]) setTotal(rows[0].total_count);
      else setTotal(songs.length);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtersKey, songs.length, pageSize, loading, loadingMore, hasMore]);

  // Drop a row that no longer matches the active filters (e.g. the song was
  // just added to the caller's repertoire while excludeMine is on). Keeping
  // songs.length and total in sync here is what keeps the next loadMore
  // offset and the hasMore check correct without a refetch.
  const removeSong = useCallback((songId: string) => {
    if (!songsRef.current.some((s) => s.song_id === songId)) return;
    setSongs((prev) => prev.filter((s) => s.song_id !== songId));
    setTotal((t) => (t === null ? t : Math.max(0, t - 1)));
  }, []);

  return { songs, total, loading, loadingMore, error, hasMore, loadMore, removeSong };
}
