import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import YouTubePlayer from '@/components/YouTubePlayer';
import { addSongSpellingNote, KNOWN_AS, parseRecordingLink, type KnownAs } from '@singjam/core';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

type Match = {
  title: string;
  artist: string | null;
  artist_known?: boolean;
  spotify_url: string | null;
  release_year: number | null;
  youtube_id: string | null;
  youtube_official: boolean;
  existing: { id: string; slug: string | null; title: string; display_artist: string | null; match: 'same' | 'possible' } | null;
  // The found song's text, when we hold it, with one song per tune.
  text?: { text_id: string; tunes: TextTune[] } | null;
};

type TextTune = { id: string; slug: string | null; title: string; display_artist: string | null; tune: string | null };
type NewTune = { recording_url: string; name: string };

// Mirrors web's SubmitSongForm: look the song up, show the YouTube match so the
// user can confirm it's the one they mean, then add it. The server fills in the
// rest (writers, years, key, tags, lyrics) in the background.
// `forSet` (a set's Add songs) words it for adding the song to that set, and
// `setId` lets enrichment use that set's jam tags as context.
export default function SubmitMissingSong({
  defaultTitle = '',
  forSet = false,
  setId,
  onCreated,
}: {
  defaultTitle?: string;
  forSet?: boolean;
  setId?: string;
  onCreated: (songId: string, title: string) => void;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [artist, setArtist] = useState('');
  const [match, setMatch] = useState<Match | null>(null);
  const [knownAs, setKnownAs] = useState<KnownAs | null>(null);
  const [firstLine, setFirstLine] = useState('');
  const [busy, setBusy] = useState<'lookup' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addingTune, setAddingTune] = useState(false);
  const [newTune, setNewTune] = useState<NewTune>({ recording_url: '', name: '' });

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

  async function submit(chosen: Match, addAnyway = false, tune?: NewTune) {
    setBusy('submit');
    setError(null);
    const auth = await authHeader();
    if (!auth) { setBusy(null); setError('Sign in to add a song.'); return; }
    try {
      const res = await fetch(`${WEB_URL}/api/songs/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({
          ...chosen, confirmed: true, add_anyway: addAnyway, new_tune: tune ?? null,
          known_as: knownAs, first_line_hint: firstLine.trim() || null, set_id: setId ?? null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      // 409 means it already exists — still hand back the id so we open it.
      if (res.ok || (res.status === 409 && json.id)) {
        onCreated(json.id, (res.ok ? null : chosen.existing?.title) ?? chosen.title);
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
    return (t: string) => { setter(t); setMatch(null); setError(null); setAddingTune(false); setNewTune({ recording_url: '', name: '' }); };
  }

  const hasMedia = !!(match?.youtube_id || match?.spotify_url);
  const tunes = match?.text?.tunes.length ? match.text.tunes : null;

  return (
    <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-4">
      <Text className="font-semibold text-zinc-900">Add a missing song</Text>
      <Text className="mt-0.5 text-xs text-zinc-500">
        {forSet
          ? "We'll look it up, add it to the library and put it in this set."
          : "We'll look it up and add it to the library so you can add it to your repertoire."}
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

      {match && tunes ? (
        <TuneChoice
          tunes={tunes}
          forSet={forSet}
          onPick={(t) => onCreated(t.id, t.title)}
          adding={addingTune}
          onAdding={setAddingTune}
          newTune={newTune}
          onNewTune={setNewTune}
          onAddTune={() => submit(match, true, newTune)}
          busy={busy === 'submit'}
        />
      ) : match ? (
        <View className="mt-3">
          <Text className="text-sm text-zinc-700 mb-2">
            {match.existing ? 'Already in the library: ' : 'Is this the song? '}
            <Text className="font-medium">{match.existing?.title ?? match.title}</Text>
            {(match.existing ? match.existing.display_artist : match.artist) ? (
              <Text className="text-zinc-500"> · {match.existing ? match.existing.display_artist : match.artist}</Text>
            ) : null}
          </Text>
          {(() => {
            const note = addSongSpellingNote(artist, match);
            if (!note) return null;
            return note.tone === 'warning' ? (
              <Text accessibilityRole="alert" className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">{note.text}</Text>
            ) : (
              <Text className="mb-2 text-xs text-zinc-500">{note.text}</Text>
            );
          })()}
          {match.youtube_id ? (
            <YouTubePlayer videoId={match.youtube_id} />
          ) : !hasMedia ? (
            <Text className="text-xs text-zinc-400 mb-2">No recording found to preview — you can still add the song.</Text>
          ) : null}
        </View>
      ) : null}

      {match && !tunes && match.existing?.match !== 'same' ? (
        <View className="mt-3 rounded-xl bg-zinc-50 p-3">
          <Text className="text-sm font-medium text-zinc-700">
            How do you know it? <Text className="font-normal text-zinc-400">Optional</Text>
          </Text>
          <View className="mt-1.5 flex-row flex-wrap" style={{ gap: 8 }}>
            {KNOWN_AS.map((k) => (
              <TouchableOpacity
                key={k.value}
                onPress={() => setKnownAs(knownAs === k.value ? null : k.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: knownAs === k.value }}
                className={`px-3 py-1 rounded-full border ${knownAs === k.value ? 'border-amber-500 bg-amber-500' : 'border-slate-200 bg-white'}`}
              >
                <Text className={`text-sm ${knownAs === k.value ? 'text-white' : 'text-slate-600'}`}>{k.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text className="mt-3 text-sm font-medium text-zinc-700">
            How does it start? <Text className="font-normal text-zinc-400">Optional</Text>
          </Text>
          <TextInput
            className="mt-1.5 border border-zinc-200 rounded-xl bg-white px-3 py-2 text-zinc-900"
            placeholder="The first line, if you know it"
            placeholderTextColor="#a1a1aa"
            value={firstLine}
            onChangeText={setFirstLine}
            maxLength={200}
            editable={!busy}
            accessibilityLabel="How does it start?"
          />
          <Text className="mt-2 text-xs text-zinc-500">Helps us fill in the right writers, words and details.</Text>
        </View>
      ) : null}

      {error ? <Text className="text-red-500 text-sm mt-2">{error}</Text> : null}

      {tunes && !!artist.trim() && match?.existing?.match === 'possible' ? (
        <TouchableOpacity onPress={() => submit(match, true)} disabled={!!busy} className="mt-2 rounded-xl py-3 items-center border border-zinc-200">
          <Text className="text-zinc-500">It's a different song — add it</Text>
        </TouchableOpacity>
      ) : tunes ? null : match?.existing ? (
        <>
          <TouchableOpacity onPress={() => onCreated(match.existing!.id, match.existing!.title)} className="mt-3 rounded-xl py-3 items-center bg-amber-500">
            <Text className="font-semibold text-white">{forSet ? 'Add it to the set' : 'Open it'}</Text>
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

// The words are already here, one song per tune. Pick the tune you sing, or add
// yours with a recording of it, which is how we know which melody it is.
function TuneChoice({ tunes, forSet, onPick, adding, onAdding, newTune, onNewTune, onAddTune, busy }: {
  tunes: TextTune[];
  forSet: boolean;
  onPick: (t: TextTune) => void;
  adding: boolean;
  onAdding: (v: boolean) => void;
  newTune: NewTune;
  onNewTune: (t: NewTune) => void;
  onAddTune: () => void;
  busy: boolean;
}) {
  const linkOk = !!parseRecordingLink(newTune.recording_url);
  return (
    <View className="mt-3">
      <Text className="text-sm text-zinc-700 mb-2">
        <Text className="font-medium">{tunes[0].title}</Text> is already in the library. Which tune do you sing it to?
      </Text>
      <View className="rounded-xl border border-zinc-200 overflow-hidden">
        {tunes.map((t, i) => (
          <View key={t.id} className={`flex-row items-center justify-between px-3 py-2 ${i ? 'border-t border-zinc-100' : ''}`} style={{ gap: 12 }}>
            <Text className="flex-1 text-sm text-zinc-800">
              {t.tune ?? <Text className="text-zinc-500">Tune not named</Text>}
              {t.display_artist ? <Text className="text-zinc-500"> · {t.display_artist}</Text> : null}
            </Text>
            <TouchableOpacity onPress={() => onPick(t)} accessibilityRole="button" className="rounded-full bg-amber-500 px-3 py-1">
              <Text className="text-sm font-semibold text-white">{forSet ? 'Add this one' : 'Open'}</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
      {adding ? (
        <View className="mt-3 rounded-xl bg-zinc-50 p-3">
          <Text className="text-sm font-medium text-zinc-700">
            Link to a recording of your tune <Text className="text-red-500">*</Text>
          </Text>
          <TextInput
            className="mt-1.5 border border-zinc-200 rounded-xl bg-white px-3 py-2 text-zinc-900"
            placeholder="A YouTube or Spotify link"
            placeholderTextColor="#a1a1aa"
            value={newTune.recording_url}
            onChangeText={(v) => onNewTune({ ...newTune, recording_url: v })}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            accessibilityLabel="Link to a recording of your tune"
          />
          {newTune.recording_url.trim() && !linkOk ? (
            <Text className="mt-1 text-xs text-amber-700">Paste a link to one YouTube video or Spotify track.</Text>
          ) : null}
          <Text className="mt-3 text-sm font-medium text-zinc-700">
            Tune name <Text className="font-normal text-zinc-400">Optional</Text>
          </Text>
          <TextInput
            className="mt-1.5 border border-zinc-200 rounded-xl bg-white px-3 py-2 text-zinc-900"
            placeholder="Its name or composer, if you know it"
            placeholderTextColor="#a1a1aa"
            value={newTune.name}
            onChangeText={(v) => onNewTune({ ...newTune, name: v })}
            maxLength={80}
            accessibilityLabel="Tune name"
          />
          <TouchableOpacity
            onPress={onAddTune}
            disabled={!linkOk || busy}
            className={`mt-3 rounded-xl py-3 items-center ${linkOk ? 'bg-amber-500' : 'bg-zinc-200'}`}
          >
            {busy ? <ActivityIndicator color="#fff" /> : (
              <Text className={`font-semibold ${linkOk ? 'text-white' : 'text-zinc-400'}`}>Add this tune</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity onPress={() => onAdding(true)} className="mt-3 rounded-xl py-3 items-center border border-zinc-200">
          <Text className="text-zinc-600">I sing it to a different tune</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
