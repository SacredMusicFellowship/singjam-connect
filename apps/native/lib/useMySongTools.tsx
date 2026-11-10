import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { fetchAllRows } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import KeyPicker from '@/components/KeyPicker';
import AddToSetModal from '@/components/AddToSetModal';

export type MySongTools = {
  details: Map<string, { key: string | null; chart: string | null }>;
  // Loads a song added from a card (its chart, no key yet).
  ensure: (songId: string) => void;
  openKey: (songId: string) => void;
  openAddToSet: (song: { song_id: string; title: string }) => void;
};

// A song card's tools for a song already in My songs, as on the song screen and
// My songs: your key, Add to set, and its chord chart (web's useSongCardActions
// tools). Render `modals` once on the screen.
export function useMySongTools() {
  const [userId, setUserId] = useState<string | null>(null);
  const [details, setDetails] = useState<MySongTools['details']>(new Map());
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [setSong, setSetSong] = useState<{ id: string; title: string } | null>(null);
  const latest = useRef(details);
  latest.current = details;

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setUserId(session.user.id);
      const rows = await fetchAllRows<{ song_id: string; key_note: string | null; songs: any }>((f, t) =>
        supabase.from('user_songs').select('song_id, key_note, songs(chord_chart_url)').eq('user_id', session.user.id).order('song_id').range(f, t) as any
      );
      setDetails(new Map(rows.map(r => [r.song_id, { key: r.key_note, chart: r.songs?.chord_chart_url ?? null }])));
    }).catch(() => {});
  }, []);

  const ensure = useCallback(async (songId: string) => {
    if (latest.current.has(songId)) return;
    const { data } = await supabase.from('songs').select('chord_chart_url').eq('id', songId).maybeSingle();
    setDetails(prev => (prev.has(songId) ? prev : new Map(prev).set(songId, { key: null, chart: (data as any)?.chord_chart_url ?? null })));
  }, []);

  const setKey = useCallback(async (songId: string, key: string | null) => {
    if (!userId) return;
    const before = latest.current.get(songId);
    setDetails(prev => new Map(prev).set(songId, { key, chart: prev.get(songId)?.chart ?? null }));
    const { error } = await supabase.from('user_songs').update({ key_note: key }).eq('user_id', userId).eq('song_id', songId);
    if (error) {
      setDetails(prev => new Map(prev).set(songId, before ?? { key: null, chart: null }));
      Alert.alert('Error', error.message);
    }
  }, [userId]);

  const openAddToSet = useCallback((song: { song_id: string; title: string }) => setSetSong({ id: song.song_id, title: song.title }), []);
  // Stable between renders unless the details change, so memoised cards and list rows don't all re-render.
  const tools = useMemo<MySongTools>(() => ({ details, ensure, openKey: setKeyFor, openAddToSet }), [details, ensure, openAddToSet]);

  const modals = (
    <>
      <KeyPicker
        visible={keyFor !== null}
        title="My key"
        current={keyFor ? details.get(keyFor)?.key ?? null : null}
        onClose={() => setKeyFor(null)}
        onSelect={(key) => { if (keyFor) setKey(keyFor, key); setKeyFor(null); }}
      />
      {setSong ? <AddToSetModal visible songs={[setSong]} onClose={() => setSetSong(null)} /> : null}
    </>
  );

  return { tools, modals };
}
