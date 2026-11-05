import type { ProductionCredit, RecordingArtistCredit } from "@singjam/core";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export type SongSearchResult = {
  song_id: string;
  title: string;
  display_artist: string | null;
  first_line: string | null;
  aka: string[] | null;
  score: number;
  composers: string[];
  cultures: string[];
  productions: string[];
  genres: string[];
  languages: string[];
  themes: string[];
  vibe: string | null;
  tonality: string | null;
  meter: string | null;
  year: number | null;
  slug: string | null;
  popularity: number;
  youtube_id: string | null;
  spotify_track_id: string | null;
  recording_artists?: RecordingArtistCredit[] | null;
  production_credits?: ProductionCredit[] | null;
};

export function useSongSearch(
  query: string,
  { limit = 50, debounceMs = 250 }: { limit?: number; debounceMs?: number } = {}
): { results: SongSearchResult[]; loading: boolean; error: string | null } {
  const supabase = useRef(supabaseBrowser()).current;
  const [results, setResults] = useState<SongSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
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
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { data, error: rpcError } = await supabase.rpc("search_songs", { q: trimmed, limit_n: limit });
      if (seq !== requestSeq.current) return;
      setLoading(false);
      if (rpcError) {
        setError("Search failed. Please try again.");
        setResults([]);
      } else {
        setError(null);
        setResults((data ?? []) as SongSearchResult[]);
      }
    }, debounceMs);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, limit, debounceMs]);

  return { results, loading, error };
}
