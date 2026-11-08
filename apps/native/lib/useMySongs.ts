import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { fetchAllRows } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import { ensureLeadVoice } from '@/lib/leadVoice';

// The viewer's songs and the add action for SuggestionCard lists outside the
// Song Library (browse screens) — the same upsert and lead-voice check.
export function useMySongs() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [singingVoice, setSingingVoice] = useState<string | null>(null);
  const [myConfidence, setMyConfidence] = useState<Map<string, string>>(new Map());
  const latest = useRef(myConfidence);
  latest.current = myConfidence;

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      setUserId(session.user.id);
      const [{ data: profile }, rows] = await Promise.all([
        supabase.from('profiles').select('singing_voice').eq('id', session.user.id).single(),
        fetchAllRows<{ song_id: string; confidence: string }>((f, t) =>
          supabase.from('user_songs').select('song_id, confidence').eq('user_id', session.user.id).order('song_id').range(f, t)
        ),
      ]);
      setSingingVoice((profile as any)?.singing_voice ?? null);
      setMyConfidence(new Map(rows.map(r => [r.song_id, r.confidence])));
    }).catch(() => {});
  }, []);

  const addSong = useCallback(async (song: { song_id: string }, confidence: string) => {
    if (!userId) { router.push('/(auth)/sign-in' as any); return; }
    if (!(await ensureLeadVoice(confidence, singingVoice, userId, setSingingVoice))) return;
    const previous = latest.current;
    setMyConfidence(prev => new Map(prev).set(song.song_id, confidence));
    const { error } = await supabase.from('user_songs').upsert(
      { user_id: userId, song_id: song.song_id, confidence, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,song_id' }
    );
    if (error) {
      Alert.alert('Error', error.message);
      setMyConfidence(previous);
    }
  }, [userId, router, singingVoice]);

  return { myConfidence, addSong };
}
