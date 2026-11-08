import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAllRows } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

// What every SongCard needs to add a song to My songs: the viewer's songs and
// singing voice, the open confidence picker, and the add itself. Shared by the
// Song Library and browse pages so the cards behave the same everywhere.
export function useSongCardActions({ onAdded }: { onAdded?: (songId: string, level: string) => void } = {}) {
  const supabase = useRef(supabaseBrowser()).current;
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);
  const [singingVoice, setSingingVoice] = useState<string | null>(null);
  const [repertoire, setRepertoire] = useState<Map<string, string>>(new Map());
  const [pendingAddId, setPendingAddId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    // Session from local storage (fast), then profile and the viewer's songs — all of them.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setCurrentUser(session.user);
      Promise.all([
        supabase.from("profiles").select("singing_voice").eq("id", session.user.id).single(),
        fetchAllRows<{ song_id: string; confidence: string | null }>((f, t) =>
          supabase.from("user_songs").select("song_id, confidence").eq("user_id", session.user.id).order("song_id").range(f, t)
        ),
      ]).then(([profileRes, rows]) => {
        setSingingVoice((profileRes.data as any)?.singing_voice ?? null);
        setRepertoire(new Map(rows.map((r) => [r.song_id, r.confidence ?? ""])));
      }, () => {});
    });
  }, [supabase]);

  const onAdd = useCallback(async (songId: string, slug?: string | null) => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      router.push(`/auth?next=${encodeURIComponent(slug ? `/songs/${slug}` : window.location.pathname + window.location.search)}`);
      return;
    }
    setPendingAddId(songId);
  }, [supabase, router]);

  const addSong = useCallback(async (songId: string, level: string) => {
    setPendingAddId(null);
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) { router.push(`/auth?next=${encodeURIComponent(window.location.pathname)}`); return; }
    const { error } = await supabase.from("user_songs").upsert(
      { user_id: session.user.id, song_id: songId, confidence: level, updated_at: new Date().toISOString() },
      { onConflict: "user_id,song_id" }
    );
    if (error) {
      setStatus(error.message);
    } else {
      setRepertoire((prev) => new Map(prev).set(songId, level));
      onAdded?.(songId, level);
    }
  }, [supabase, router, onAdded]);

  return {
    currentUser,
    status,
    repertoire,
    cardProps: { repertoire, pendingAddId, singingVoice, setPendingAddId, onAdd, addSong, onVoiceUpdated: setSingingVoice },
  };
}
