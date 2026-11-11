import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';
import { fetchAllRows } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/cache';
import { ensureLeadVoice } from '@/lib/leadVoice';

// The viewer's songs (role, key, chord chart), loaded once per signed-in
// session and shared by every screen that shows song cards — like
// useTagHierarchy. Screens that change user_songs themselves (My songs, the
// song screen, a set) report the change with `noteMySong` so cards elsewhere
// never offer "I know this song!" for a song you already have.

export type MySong = { confidence: string; key: string | null; chart: string | null };

type State = {
  userId: string | null;
  // False until the songs are known (from the device cache or the database):
  // before that a card can't tell whether a song is yours.
  loaded: boolean;
  singingVoice: string | null;
  songs: Map<string, MySong>;
};

const CACHE_KEY = '/my-songs';

let state: State = { userId: null, loaded: false, singingVoice: null, songs: new Map() };
let loading: Promise<void> | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function set(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function patchSong(songId: string, next: MySong | null) {
  const songs = new Map(state.songs);
  if (next) songs.set(songId, next);
  else songs.delete(songId);
  set({ songs });
  if (state.userId) writeCache(CACHE_KEY, state.userId, [...songs]);
}

async function load(): Promise<void> {
  const gen = ++generation;
  const { data: { session } } = await supabase.auth.getSession();
  const uid = session?.user.id ?? null;
  if (gen !== generation) return;
  if (!uid) { set({ userId: null, loaded: true, singingVoice: null, songs: new Map() }); return; }
  const cached = await readCache<[string, MySong][]>(CACHE_KEY, uid);
  if (gen !== generation) return;
  set({ userId: uid, ...(cached ? { loaded: true, songs: new Map(cached) } : {}) });
  const [{ data: profile }, rows] = await Promise.all([
    supabase.from('profiles').select('singing_voice').eq('id', uid).maybeSingle(),
    fetchAllRows<{ song_id: string; confidence: string | null; key_note: string | null; songs: { chord_chart_url: string | null } | null }>((f, t) =>
      supabase.from('user_songs').select('song_id, confidence, key_note, songs(chord_chart_url)').eq('user_id', uid).order('song_id').range(f, t) as any
    ),
  ]);
  if (gen !== generation) return;
  const songs = new Map(rows.map((r) => [r.song_id, { confidence: r.confidence ?? 'learn', key: r.key_note, chart: r.songs?.chord_chart_url ?? null }]));
  set({ loaded: true, singingVoice: (profile as any)?.singing_voice ?? null, songs });
  writeCache(CACHE_KEY, uid, [...songs]);
}

function ensureLoaded() {
  loading ??= load().catch(() => {
    loading = null;
    set({ loaded: true });
  });
}

// A different account (or signing out) starts again.
supabase.auth.onAuthStateChange((_event, session) => {
  if ((session?.user.id ?? null) === state.userId && loading) return;
  state = { userId: null, loaded: false, singingVoice: null, songs: new Map() };
  loading = null;
  if (listeners.size > 0) ensureLoaded();
  listeners.forEach((l) => l());
});

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureLoaded();
  return () => { listeners.delete(listener); };
}

export function useMySongsState(): State {
  return useSyncExternalStore(subscribe, () => state);
}

// Another screen changed one of your songs; null = removed.
export function noteMySong(songId: string, change: Partial<MySong> | null) {
  if (!change) { if (state.songs.has(songId)) patchSong(songId, null); return; }
  const before = state.songs.get(songId);
  patchSong(songId, { confidence: change.confidence ?? before?.confidence ?? 'learn', key: change.key !== undefined ? change.key : before?.key ?? null, chart: change.chart !== undefined ? change.chart : before?.chart ?? null });
  if (!before && change.chart === undefined) loadChart(songId);
}

// A newly added song's chord chart, for its card's chart button.
async function loadChart(songId: string) {
  const uid = state.userId;
  const { data } = await supabase.from('songs').select('chord_chart_url').eq('id', songId).maybeSingle();
  const now = state.songs.get(songId);
  if (now && state.userId === uid) patchSong(songId, { ...now, chart: (data as any)?.chord_chart_url ?? null });
}

export function noteSingingVoice(voice: string) {
  set({ singingVoice: voice });
}

// Adding and changing the role are the same upsert, as on web. Returns false
// when it didn't happen (not signed in, Lead declined, or an error).
export async function setMySongRole(songId: string, confidence: string): Promise<boolean> {
  const uid = state.userId;
  if (!uid) return false;
  if (!(await ensureLeadVoice(confidence, state.singingVoice, uid, noteSingingVoice))) return false;
  const before = state.songs.get(songId) ?? null;
  patchSong(songId, { confidence, key: before?.key ?? null, chart: before?.chart ?? null });
  const { error } = await supabase.from('user_songs').upsert(
    { user_id: uid, song_id: songId, confidence, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,song_id' }
  );
  if (error) {
    Alert.alert('Error', error.message);
    patchSong(songId, before);
    return false;
  }
  if (!before) loadChart(songId);
  return true;
}

export async function setMySongKey(songId: string, key: string | null) {
  const uid = state.userId;
  const before = state.songs.get(songId);
  if (!uid || !before) return;
  patchSong(songId, { ...before, key });
  const { error } = await supabase.from('user_songs').update({ key_note: key }).eq('user_id', uid).eq('song_id', songId);
  if (error) {
    patchSong(songId, before);
    Alert.alert('Error', error.message);
  }
}
