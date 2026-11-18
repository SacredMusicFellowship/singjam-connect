import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

async function post(path: string, body: unknown) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, json: { error: 'Sign in first.' } };
  const res = await fetch(`${WEB_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

// Mirrors web's ChordChartSlot + ReportChartButton: anyone signed in can add an
// Ultimate Guitar chart or report a problem with the current one.
export default function ChordChartControls({
  songId,
  url,
  signedIn,
  onChanged,
}: {
  songId: string;
  url: string | null;
  signedIn: boolean;
  onChanged: (url: string) => void;
}) {
  const [mode, setMode] = useState<'idle' | 'add' | 'report'>('idle');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const { ok, json } = mode === 'add'
      ? await post(`/api/songs/${songId}/charts`, { url: input.trim() })
      : await post(`/api/songs/${songId}/charts/report`, { note: input.trim() });
    setBusy(false);
    if (!ok) { setError(json.error ?? 'Something went wrong. Please try again.'); return; }
    if (mode === 'add' && json.live) onChanged(input.trim());
    setMessage(mode === 'add' ? 'Thanks — a song editor will check it.' : 'Thanks — a song editor will take a look.');
    setMode('idle');
    setInput('');
  }

  if (!url && !signedIn) return null;

  return (
    <View className="mt-2">
      {message ? <Text className="text-xs text-zinc-500 mt-1">{message}</Text> : null}
      {mode === 'idle' && signedIn ? (
        <TouchableOpacity onPress={() => { setMode(url ? 'report' : 'add'); setMessage(null); }} className="mt-1 self-start">
          {url ? (
            <Text className="text-xs text-zinc-400 underline">Report a problem with this chart</Text>
          ) : (
            <View className="rounded-full border border-dashed border-zinc-400 px-4 py-2">
              <Text className="text-sm font-medium text-zinc-600">Add chord chart</Text>
            </View>
          )}
        </TouchableOpacity>
      ) : null}
      {mode !== 'idle' ? (
        <View className="mt-2">
          <TextInput
            className="border border-zinc-300 rounded-xl px-3 py-2 text-zinc-900 text-sm"
            placeholder={mode === 'add' ? 'Paste an Ultimate Guitar link…' : "What's wrong? (optional)"}
            placeholderTextColor="#a1a1aa"
            value={input}
            onChangeText={setInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={mode === 'add' ? 'url' : 'default'}
            autoFocus
          />
          {error ? <Text className="text-red-500 text-xs mt-1">{error}</Text> : null}
          <View className="flex-row gap-2 mt-2">
            <TouchableOpacity
              onPress={submit}
              disabled={busy || (mode === 'add' && !input.trim())}
              className="rounded-full bg-amber-500 px-4 py-2"
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : (
                <Text className="text-white text-sm font-semibold">{mode === 'add' ? 'Save' : 'Report'}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setMode('idle'); setInput(''); setError(null); }} className="rounded-full border border-zinc-200 px-4 py-2">
              <Text className="text-zinc-500 text-sm">Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
    </View>
  );
}
