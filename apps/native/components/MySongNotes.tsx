import { useEffect, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { PERSONAL_SONG_NOTES_MAX } from '@singjam/core';
import { supabase } from '@/lib/supabase';

// Mirrors web's MySongNotes: a member's private notes on a song in their
// repertoire (user_song_notes, readable only by them).
export default function MySongNotes({ songId, userId }: { songId: string; userId: string }) {
  const [notes, setNotes] = useState<string | null>(null);
  const [savedNotes, setSavedNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('user_song_notes')
      .select('notes')
      .eq('user_id', userId)
      .eq('song_id', songId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const loaded = (data as any)?.notes ?? '';
        setNotes(loaded);
        setSavedNotes(loaded);
      });
    return () => { cancelled = true; };
  }, [songId, userId]);

  async function saveNotes() {
    const next = (notes ?? '').trim();
    if (next === savedNotes) return;
    setStatus('saving');
    const { error } = next
      ? await supabase.from('user_song_notes').upsert({ user_id: userId, song_id: songId, notes: next, updated_at: new Date().toISOString() })
      : await supabase.from('user_song_notes').delete().eq('user_id', userId).eq('song_id', songId);
    if (error) { setStatus('error'); return; }
    setSavedNotes(next);
    setNotes(next);
    setStatus('saved');
  }

  return (
    <View className="px-4 py-4 border-b border-slate-100">
      <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">My notes</Text>
      {notes === null ? (
        <View className="h-20 rounded-lg bg-slate-100" />
      ) : (
        <TextInput
          value={notes}
          onChangeText={(t) => { setNotes(t); setStatus('idle'); }}
          onBlur={saveNotes}
          maxLength={PERSONAL_SONG_NOTES_MAX}
          multiline
          placeholder="Capo, strumming, the bridge you always forget…"
          placeholderTextColor="#94a3b8"
          accessibilityLabel="My notes"
          className="min-h-[80px] rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
          style={{ textAlignVertical: 'top' }}
        />
      )}
      <Text className="text-xs text-slate-400 mt-2">
        {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved. Only you can see your notes.' : status === 'error' ? "Couldn't save. Try again." : 'Only you can see your notes.'}
      </Text>
    </View>
  );
}
