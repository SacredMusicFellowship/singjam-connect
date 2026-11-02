import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PERSONAL_SONG_NOTES_MAX } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import KeyPicker from '@/components/KeyPicker';

// Mirrors web's MySongNotes: the member's own key (shared with set-mates via
// user_songs) and private notes (user_song_notes, readable only by them).
export default function MySongNotes({ songId, userId }: { songId: string; userId: string }) {
  const [keyNote, setKeyNote] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [savedNotes, setSavedNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pickerVisible, setPickerVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from('user_songs').select('key_note').eq('user_id', userId).eq('song_id', songId).maybeSingle(),
      supabase.from('user_song_notes').select('notes').eq('user_id', userId).eq('song_id', songId).maybeSingle(),
    ]).then(([keyRes, notesRes]) => {
      if (cancelled) return;
      setKeyNote((keyRes.data as any)?.key_note ?? null);
      const loaded = (notesRes.data as any)?.notes ?? '';
      setNotes(loaded);
      setSavedNotes(loaded);
    });
    return () => { cancelled = true; };
  }, [songId, userId]);

  async function saveKey(next: string | null) {
    const prev = keyNote;
    setKeyNote(next);
    const { error } = await supabase.from('user_songs').update({ key_note: next }).eq('user_id', userId).eq('song_id', songId);
    if (error) { setKeyNote(prev); Alert.alert('Error', error.message); }
  }

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
      <KeyPicker
        visible={pickerVisible}
        title="My key"
        current={keyNote}
        onClose={() => setPickerVisible(false)}
        onSelect={saveKey}
      />
      <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">My key & notes</Text>
      <View className="flex-row flex-wrap items-center gap-2 mb-3">
        <TouchableOpacity
          onPress={() => setPickerVisible(true)}
          className={`flex-row items-center rounded-xl border px-2.5 py-1.5 ${keyNote ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}
          accessibilityLabel="My key"
        >
          <Text className={`text-sm ${keyNote ? 'text-amber-800 font-medium' : 'text-slate-500'}`}>
            {keyNote ? `Key: ${keyNote}` : 'My key'}
          </Text>
          <Ionicons name="chevron-down" size={12} color={keyNote ? '#92400e' : '#71717a'} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        <Text className="text-xs text-slate-400">Shown next to your name on set lists.</Text>
      </View>
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
