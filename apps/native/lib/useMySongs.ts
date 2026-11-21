import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { setMySongRole, useMySongsState } from '@/lib/mySongsStore';

// Your role on each song and the add action for song cards (Song Library,
// browse screens), from the session's shared My-songs store.
export function useMySongs() {
  const router = useRouter();
  const { userId, loaded, songs } = useMySongsState();
  const myConfidence = useMemo(() => new Map([...songs].map(([id, s]) => [id, s.confidence])), [songs]);

  const addSong = useCallback(async (song: { song_id: string }, confidence: string) => {
    if (!userId) { router.push('/(auth)/sign-in' as any); return; }
    await setMySongRole(song.song_id, confidence);
  }, [userId, router]);

  return { userId, loaded, myConfidence, addSong };
}
