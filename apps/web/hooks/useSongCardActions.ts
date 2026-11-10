import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchAllRows, setsAcceptingSongs } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

// A song card's tools for a song already in My songs, as on the song page and
// My songs: your key, your sets, and its chord chart.
export type MySongTools = {
  details: Map<string, { key: string | null; chart: string | null }>;
  sets: { id: string; name: string }[];
  inSets: Record<string, Set<string>>;
  loadSetMemberships: (songId: string) => void;
  addedToSet: (songId: string, setId: string) => void;
  setCreated: (set: { id: string; name: string }) => void;
  updateKey: (songId: string, key: string | null) => void;
  chartAdded: (songId: string, url: string) => void;
};

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
  const [details, setDetails] = useState<MySongTools["details"]>(new Map());
  const [sets, setSets] = useState<MySongTools["sets"]>([]);
  const [inSets, setInSets] = useState<MySongTools["inSets"]>({});

  useEffect(() => {
    // Session from local storage (fast), then profile and the viewer's songs — all of them.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      setCurrentUser(session.user);
      Promise.all([
        supabase.from("profiles").select("singing_voice").eq("id", session.user.id).single(),
        fetchAllRows<{ song_id: string; confidence: string | null; key_note: string | null; songs: any }>((f, t) =>
          supabase.from("user_songs").select("song_id, confidence, key_note, songs(chord_chart_url)").eq("user_id", session.user.id).order("song_id").range(f, t) as any
        ),
        fetch("/api/sets").then((r) => (r.ok ? r.json() : { owned: [], collaborating: [] })).catch(() => ({ owned: [], collaborating: [] })),
      ]).then(([profileRes, rows, setsJson]) => {
        setSingingVoice((profileRes.data as any)?.singing_voice ?? null);
        setRepertoire(new Map(rows.map((r) => [r.song_id, r.confidence ?? ""])));
        setDetails(new Map(rows.map((r) => [r.song_id, { key: r.key_note, chart: r.songs?.chord_chart_url ?? null }])));
        setSets(setsAcceptingSongs([...(setsJson.owned ?? []), ...(setsJson.collaborating ?? [])]));
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
      // The card now shows the song's tools, so it needs the chart it already has.
      if (!details.has(songId)) {
        const { data: song } = await supabase.from("songs").select("chord_chart_url").eq("id", songId).maybeSingle();
        setDetails((prev) => new Map(prev).set(songId, { key: null, chart: (song as any)?.chord_chart_url ?? null }));
      }
    }
  }, [supabase, router, onAdded, details]);

  const loadSetMemberships = useCallback(async (songId: string) => {
    if (inSets[songId] !== undefined) return;
    const { data } = await supabase.from("set_songs").select("set_id").eq("song_id", songId);
    if (data) setInSets((prev) => ({ ...prev, [songId]: new Set(data.map((r: any) => r.set_id as string)) }));
  }, [supabase, inSets]);

  const updateKey = useCallback(async (songId: string, key: string | null) => {
    if (!currentUser) return;
    const before = details.get(songId);
    setDetails((prev) => new Map(prev).set(songId, { key, chart: prev.get(songId)?.chart ?? null }));
    const { error } = await supabase.from("user_songs").update({ key_note: key }).eq("user_id", currentUser.id).eq("song_id", songId);
    if (error) {
      setDetails((prev) => new Map(prev).set(songId, before ?? { key: null, chart: null }));
      setStatus(error.message);
    }
  }, [supabase, currentUser, details]);

  const tools: MySongTools = {
    details,
    sets,
    inSets,
    loadSetMemberships,
    addedToSet: (songId, setId) => setInSets((prev) => ({ ...prev, [songId]: new Set([...(prev[songId] ?? []), setId]) })),
    setCreated: (set) => setSets((prev) => [set, ...prev]),
    updateKey,
    chartAdded: (songId, url) => setDetails((prev) => new Map(prev).set(songId, { key: prev.get(songId)?.key ?? null, chart: url })),
  };

  return {
    currentUser,
    status,
    repertoire,
    cardProps: { repertoire, pendingAddId, singingVoice, setPendingAddId, onAdd, addSong, onVoiceUpdated: setSingingVoice, tools },
  };
}
