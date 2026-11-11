import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import YouTubePlayer from '@/components/YouTubePlayer';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

type Match = {
  title: string;
  artist: string | null;
  spotify_url: string | null;
  release_year: number | null;
  youtube_id: string | null;
  youtube_official: boolean;
  existing: { id: string; slug: string | null; title: string; display_artist: string | null; match: 'same' | 'possible' } | null;
};

// Mirrors web's SubmitSongForm: look the song up, show the YouTube match so the
// user can confirm it's the one they mean, then add it. The server fills in the
// rest (writers, years, key, tags, lyrics) in the background.
export default function SubmitMissingSong({
  defaultTitle = '',
  onCreated,
}: {
  defaultTitle?: string;
  onCreated: (songId: string) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [artist, setArtist] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [busy, setBusy] = useState<'lookup' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const typed = (): Match => ({
    title: title.trim(), artist: artist.trim() || null, spotify_url: null, release_year: null, youtube_id: null, youtube_official: false, existing: null,
  });

  async function authHeader() {
    const { data: { session } } = await supabase.auth.getSession();
    return session ? { Authorization: `Bearer ${session.access_token}` } : null;
  }

  async function lookup() {
    if (!title.trim()) return;
    setBusy('lookup');
    setError(null);
    const auth = await authHeader();
    if (!auth) { setBusy(null); setError('Sign in to add a song.'); return; }
    const params = new URLSearchParams({ title: title.trim() });
    if (artist.trim()) params.set('artist', artist.trim());
    try {
      const res = await fetch(`${WEB_URL}/api/songs/lookup?${params}`, { headers: auth });
      setMatch(res.ok ? await res.json() : typed());
    } catch {
      setMatch(typed());
    } finally {
      setBusy(null);
    }
  }

  async function submit(chosen: Match, addAnyway = false) {
    setBusy('submit');
    setError(null);
    const auth = await authHeader();
    if (!auth) { setBusy(null); setError('Sign in to add a song.'); return; }
    try {
      const res = await fetch(`${WEB_URL}/api/songs/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ ...chosen, confirmed: true, add_anyway: addAnyway }),
      });
      const json = await res.json().catch(() => ({}));
      // 409 means it already exists — still hand back the id so we open it.
      if (res.ok || (res.status === 409 && json.id)) {
        onCreated(json.id);
        return;
      }
      setError(json.error ?? 'Something went wrong. Please try again.');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  function edit(setter: (t: string) => void) {
    return (t: string) => { setter(t); setMatch(null); setError(null); };
  }

  const hasMedia = !!(match?.youtube_id || match?.spotify_url);

  return (
    <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <Text className="font-semibold text-zinc-900">Add a missing song</Text>
      <Text className="mt-0.5 text-xs text-zinc-500">
        We'll look it up and add it to the library so you can add it to your repertoire.
      </Text>

      <View className="mt-3">
        <Text className="text-sm font-medium text-zinc-700 mb-1">
          Song title <Text className="text-red-500">*</Text>
        </Text>
        <TextInput
          className="border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900"
          placeholder="e.g. Proud Mary"
          placeholderTextColor="#a1a1aa"
          value={title}
          onChangeText={edit(setTitle)}
          editable={!busy}
          autoCapitalize="words"
        />
      </View>

      <View className="mt-3">
        <Text className="text-sm font-medium text-zinc-700 mb-1">
          Recording artist <Text className="font-normal text-zinc-400">(optional)</Text>
        </Text>
        <TextInput
          className="border border-zinc-200 rounded-xl px-3 py-2 text-zinc-900"
          placeholder="e.g. Creedence Clearwater Revival"
          placeholderTextColor="#a1a1aa"
          value={artist}
          onChangeText={edit(setArtist)}
          editable={!busy}
          autoCapitalize="words"
        />
      </View>

      {match ? (
        <View className="mt-3">
          <Text className="text-sm text-zinc-700 mb-2">
            {match.existing ? 'Already in the library: ' : 'Is this the song? '}
            <Text className="font-medium">{match.existing?.title ?? match.title}</Text>
            {(match.existing ? match.existing.display_artist : match.artist) ? (
              <Text className="text-zinc-500"> · {match.existing ? match.existing.display_artist : match.artist}</Text>
            ) : null}
          </Text>
          {match.youtube_id ? (
            <YouTubePlayer videoId={match.youtube_id} />
          ) : !hasMedia ? (
            <Text className="text-xs text-zinc-400 mb-2">No recording found to preview — you can still add the song.</Text>
          ) : null}
        </View>
      ) : null}

      {error ? <Text className="text-red-500 text-sm mt-2">{error}</Text> : null}

      {match?.existing ? (
        <>
          <TouchableOpacity onPress={() => onCreated(match.existing!.id)} className="mt-3 rounded-xl py-3 items-center bg-amber-500">
            <Text className="font-semibold text-white">Open it</Text>
          </TouchableOpacity>
          {match.existing.match === 'possible' ? (
            <TouchableOpacity onPress={() => submit(match, true)} disabled={!!busy} className="mt-2 rounded-xl py-3 items-center border border-zinc-200">
              <Text className="text-zinc-500">It's a different song — add it</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : match ? (
        <>
          <TouchableOpacity onPress={() => submit(match)} disabled={!!busy} className="mt-3 rounded-xl py-3 items-center bg-amber-500">
            {busy === 'submit' ? <ActivityIndicator color="#fff" /> : (
              <Text className="font-semibold text-white">{hasMedia ? "Yes, that's the song — add it" : 'Add song'}</Text>
            )}
          </TouchableOpacity>
          {hasMedia ? (
            <TouchableOpacity onPress={() => submit(typed())} disabled={!!busy} className="mt-2 rounded-xl py-3 items-center border border-zinc-200">
              <Text className="text-zinc-500">Not it — add what I typed</Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : (
        <TouchableOpacity
          onPress={lookup}
          disabled={!!busy || !title.trim()}
          className={`mt-3 rounded-xl py-3 items-center ${title.trim() ? 'bg-amber-500' : 'bg-zinc-200'}`}
        >
          {busy === 'lookup' ? <ActivityIndicator color="#fff" /> : (
            <Text className={`font-semibold ${title.trim() ? 'text-white' : 'text-zinc-400'}`}>Look up</Text>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}
