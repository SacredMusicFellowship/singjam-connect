import { searchBrowseEntities, type BrowseEntityRow, type CardIdentity, type ProductionCredit, type RecordingArtistCredit } from "@singjam/core";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type SongSearchResult = {
  song_id: string;
  title: string;
  display_artist: string | null;
  byline?: string | null;
  card_identity?: CardIdentity;
  first_line: string | null;
  aka: string[] | null;
  score: number;
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
  slug: string | null;
  popularity: number;
  youtube_id: string | null;
  spotify_track_id: string | null;
  // Every match, before the limit (migration 244).
  total_count?: number;
  recording_artists?: RecordingArtistCredit[] | null;
  production_credits?: ProductionCredit[] | null;
};

export function useSongSearch(
  query: string,
  { limit = 50, debounceMs = 250, entities = false }: { limit?: number; debounceMs?: number; entities?: boolean } = {}
): { results: SongSearchResult[]; total: number; entityRows: BrowseEntityRow[]; loading: boolean; error: string | null } {
  const supabase = useRef(supabaseBrowser()).current;
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  // Browse pages whose names match (the Song Library asks for these).
  const [entityRows, setEntityRows] = useState<BrowseEntityRow[]>([]);
  const [loading, setLoading] = useState(() => query.trim().length > 0);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // Invalidate any in-flight request so a slow response for an old query
    // can't overwrite the results of a newer one.
    const seq = ++requestSeq.current;
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      setTotal(0);
      setEntityRows([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const [{ data, error: rpcError }, rows] = await Promise.all([
        supabase.rpc("search_songs", { q: trimmed, limit_n: limit }),
        entities ? searchBrowseEntities(supabase, trimmed).catch(() => []) : Promise.resolve([]),
      ]);
      if (seq !== requestSeq.current) return;
      setLoading(false);
      setEntityRows(rows);
      if (rpcError) {
        setError("Search failed. Please try again.");
        setResults([]);
      } else {
        setError(null);
        setResults((data ?? []) as SongSearchResult[]);
        setTotal(Number((data as SongSearchResult[] | null)?.[0]?.total_count ?? 0));
      }
    }, debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, limit, debounceMs, entities]);

  return { results, total, entityRows, loading, error };
}
