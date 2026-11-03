import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PERSONAL_SONG_NOTES_MAX } from '@singjam/core';
import { supabase } from '@/lib/supabase';

// Mirrors web's MySongNotes: a member's private notes on a song in their
// repertoire (user_song_notes, readable only by them), in the same add / view /
// edit pattern as set-song notes.
export default function MySongNotes({ songId, userId, className = '' }: { songId: string; userId: string; className?: string }) {
  const [notes, setNotes] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState(false);
  // Set when Cancel closes the editor, so the input's blur doesn't save.
  const discardRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('user_song_notes')
      .select('notes')
      .eq('user_id', userId)
      .eq('song_id', songId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setNotes((data as any)?.notes ?? ''); });
    return () => { cancelled = true; };
  }, [songId, userId]);

  function startEditing() {
    discardRef.current = false;
    setError(false);
    setInput(notes ?? '');
    setEditing(true);
  }

  function cancel() {
    discardRef.current = true;
    setEditing(false);
  }

  async function save(value: string = input) {
    if (discardRef.current) return;
    discardRef.current = true;
    const next = value.trim();
    setEditing(false);
    if (next === (notes ?? '')) return;
    const prev = notes;
    setNotes(next);
    const { error } = next
      ? await supabase.from('user_song_notes').upsert({ user_id: userId, song_id: songId, notes: next, updated_at: new Date().toISOString() })
      : await supabase.from('user_song_notes').delete().eq('user_id', userId).eq('song_id', songId);
    if (error) { setNotes(prev); setError(true); }
  }

  if (notes === null) return <View className={`h-6 w-24 rounded-full bg-slate-100 ${className}`} />;

  if (editing) {
    return (
      <View className={className}>
        <TextInput
          value={input}
          onChangeText={setInput}
          onBlur={() => save()}
          maxLength={PERSONAL_SONG_NOTES_MAX}
          multiline
          placeholder="Capo, strumming, the bridge you always forget…"
          placeholderTextColor="#a1a1aa"
          accessibilityLabel="My notes"
          autoFocus
          className="min-h-[56px] rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-900"
          style={{ textAlignVertical: 'top' }}
        />
        <View className="flex-row items-center gap-3 mt-2">
          <TouchableOpacity onPress={() => save()} className="rounded-lg bg-amber-500 px-3 py-1.5">
            <Text className="text-xs font-semibold text-white">Save</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={cancel} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text className="text-xs text-zinc-500">Cancel</Text>
          </TouchableOpacity>
          {notes ? (
            <TouchableOpacity onPress={() => save('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Text className="text-xs text-zinc-400">Remove note</Text>
            </TouchableOpacity>
          ) : null}
          <Text className="ml-auto text-[10px] text-zinc-400">Only you · {input.length}/{PERSONAL_SONG_NOTES_MAX}</Text>
        </View>
      </View>
    );
  }

  if (notes) {
    return (
      <View className={`flex-row items-start rounded-lg bg-zinc-50 px-2.5 py-1.5 ${className}`}>
        <Ionicons name="document-text-outline" size={14} color="#a1a1aa" style={{ marginTop: 2, marginRight: 6 }} />
        <Text className="flex-1 text-sm text-zinc-700">{notes}</Text>
        <TouchableOpacity onPress={startEditing} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} className="ml-2">
          <Text className="text-xs font-medium text-amber-600">Edit</Text>
        </TouchableOpacity>
        {error ? <Text className="ml-2 text-xs text-red-500">Couldn't save.</Text> : null}
      </View>
    );
  }

  return (
    <View className={`flex-row items-center ${className}`}>
      <TouchableOpacity
        onPress={startEditing}
        className="rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5"
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      >
        <Text className="text-xs text-zinc-500">+ Add note</Text>
      </TouchableOpacity>
      {error ? <Text className="ml-2 text-xs text-red-500">Couldn't save. Try again.</Text> : null}
    </View>
  );
}
