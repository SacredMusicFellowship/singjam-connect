import { useCallback, useMemo, useState } from 'react';
import KeyPicker from '@/components/KeyPicker';
import AddToSetModal from '@/components/AddToSetModal';
import { setMySongKey, useMySongsState, type MySong } from '@/lib/mySongsStore';

export type MySongTools = {
  details: Map<string, MySong>;
  openKey: (songId: string) => void;
  openAddToSet: (song: { song_id: string; title: string }) => void;
};

// A song card's tools for a song already in My songs, as on the song screen and
// My songs: your key, Add to set, and its chord chart (web's useSongCardActions
// tools). Render `modals` once on the screen.
export function useMySongTools() {
  const { songs } = useMySongsState();
  const [keyFor, setKeyFor] = useState<string | null>(null);
  const [setSong, setSetSong] = useState<{ id: string; title: string } | null>(null);

  const openAddToSet = useCallback((song: { song_id: string; title: string }) => setSetSong({ id: song.song_id, title: song.title }), []);
  // Stable between renders unless your songs change, so memoised cards and list rows don't all re-render.
  const tools = useMemo<MySongTools>(() => ({ details: songs, openKey: setKeyFor, openAddToSet }), [songs, openAddToSet]);

  const modals = (
    <>
      <KeyPicker
        visible={keyFor !== null}
        title="My key"
        current={keyFor ? songs.get(keyFor)?.key ?? null : null}
        onClose={() => setKeyFor(null)}
        onSelect={(key) => { if (keyFor) setMySongKey(keyFor, key); setKeyFor(null); }}
      />
      {setSong ? <AddToSetModal visible songs={[setSong]} onClose={() => setSetSong(null)} /> : null}
    </>
  );

  return { tools, modals };
}
