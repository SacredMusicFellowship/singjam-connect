import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

type LinkedSet = { id: string; name: string };
type ChoosableSet = { id: string; name: string; jam_id?: string | null; jam_name?: string | null };

// Creating, linking and unlinking run in the web API (attendees become set
// collaborators there), called with the member's bearer token, as on web's
// JamSetList.
async function api(path: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  return fetch(`${WEB_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

export default function JamSetList({ jamId, jamName, canManage }: { jamId: string; jamName: string | null; canManage: boolean }) {
  const router = useRouter();
  const [set, setSet] = useState<LinkedSet | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [choices, setChoices] = useState<ChoosableSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api(`/api/jam/${jamId}/set`)
      .then((r) => (r.ok ? r.json() : { set: null }))
      .then(({ set }) => setSet(set ?? null))
      .catch(() => setSet(null));
  }, [jamId]);

  async function handleCreate() {
    setBusy(true);
    setError(null);
    const name = jamName ? `${jamName} — set list` : 'Set list';
    const res = await api('/api/sets', 'POST', { name, jamId }).catch(() => null);
    setBusy(false);
    if (!res?.ok) { setError("Couldn't create the set list. Please try again."); return; }
    const created = await res.json();
    setSet({ id: created.id, name });
    router.push(`/set/${created.id}` as any);
  }

  async function handleShowLink() {
    setChoosing(true);
    setError(null);
    if (choices) return;
    const res = await api('/api/sets').catch(() => null);
    if (!res?.ok) { setChoices([]); return; }
    const { owned, collaborating } = await res.json();
    setChoices([...(owned ?? []), ...(collaborating ?? [])]);
  }

  async function putLink(setId: string, move: boolean): Promise<string | null> {
    const res = await api(`/api/jam/${jamId}/set`, 'PUT', { setId, move }).catch(() => null);
    if (res?.ok) return null;
    const body = res ? await res.json().catch(() => ({})) : {};
    return (body.error as string) ?? "Couldn't link that set list. Please try again.";
  }

  async function link(chosen: ChoosableSet, mode: 'link' | 'move' | 'copy') {
    setBusy(true);
    setError(null);
    let target: LinkedSet = { id: chosen.id, name: chosen.name };
    if (mode === 'copy') {
      const res = await api(`/api/sets/${chosen.id}/copy`, 'POST').catch(() => null);
      if (!res?.ok) { setBusy(false); setError("Couldn't copy that set list. Please try again."); return; }
      const copy = await res.json();
      target = { id: copy.id, name: `Copy of ${chosen.name}` };
    }
    const failure = await putLink(target.id, mode === 'move');
    setBusy(false);
    if (failure) { setError(failure); return; }
    setChoosing(false);
    setChoices(null);
    setSet(target);
  }

  function handleChoose(chosen: ChoosableSet) {
    // A set belongs to one jam, so taking one that's already linked elsewhere
    // needs the same choice web offers: move it, or link a copy.
    if (chosen.jam_id && chosen.jam_id !== jamId) {
      Alert.alert(
        `${chosen.name} is already the set list for ${chosen.jam_name ?? 'another jam'}`,
        'A set list can only belong to one jam, so moving it here removes it from that one. A copy keeps both.',
        [
          { text: 'Link a copy', onPress: () => link(chosen, 'copy') },
          { text: 'Move it here', onPress: () => link(chosen, 'move') },
          { text: 'Back', style: 'cancel' },
        ],
      );
      return;
    }
    link(chosen, 'link');
  }

  async function handleUnlink() {
    const previous = set;
    setSet(null);
    const res = await api(`/api/jam/${jamId}/set`, 'DELETE').catch(() => null);
    if (!res?.ok) setSet(previous);
  }

  if (set === undefined) return null;
  if (!canManage && !set) return null;

  return (
    <View className="px-4 mb-10">
      <Text className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Set list</Text>
      {set ? (
        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => router.push(`/set/${set.id}` as any)}
            className="flex-1 flex-row items-center border border-zinc-200 rounded-xl px-4 py-3"
            accessibilityRole="link"
          >
            <Ionicons name="list-outline" size={16} color="#a1a1aa" style={{ marginRight: 10 }} />
            <Text className="flex-1 text-zinc-900 font-medium" numberOfLines={1}>{set.name}</Text>
            <Ionicons name="chevron-forward" size={16} color="#a1a1aa" />
          </TouchableOpacity>
          {canManage ? (
            <TouchableOpacity onPress={handleUnlink} className="border border-zinc-200 rounded-xl px-3 py-3">
              <Text className="text-zinc-500 font-medium">Unlink</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : choosing ? (
        <View className="gap-2">
          {choices === null ? (
            <ActivityIndicator color="#a1a1aa" />
          ) : choices.length === 0 ? (
            <Text className="text-zinc-500 text-sm">No set lists found.</Text>
          ) : (
            choices.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => handleChoose(s)}
                disabled={busy}
                className="flex-row items-center py-3 border-b border-zinc-100"
              >
                <Ionicons name="list-outline" size={16} color="#a1a1aa" style={{ marginRight: 10 }} />
                <Text className="flex-1 text-zinc-900" numberOfLines={1}>
                  {s.jam_id && s.jam_id !== jamId ? `${s.name} (linked to ${s.jam_name ?? 'another jam'})` : s.name}
                </Text>
              </TouchableOpacity>
            ))
          )}
          <TouchableOpacity onPress={() => { setChoosing(false); setError(null); }} className="self-start border border-zinc-200 rounded-xl px-4 py-2 mt-1">
            <Text className="text-zinc-600 font-medium">Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View className="gap-3">
          <Text className="text-zinc-500 text-sm">
            Create a set list for this jam — attendees will be added as collaborators automatically.
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity onPress={handleCreate} disabled={busy} className="bg-amber-500 rounded-xl px-4 py-2.5">
              {busy ? <ActivityIndicator color="#fff" /> : <Text className="text-white font-semibold">Create set list</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShowLink} className="border border-zinc-200 rounded-xl px-4 py-2.5">
              <Text className="text-zinc-600 font-medium">Link existing</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {error ? <Text className="text-red-600 text-sm mt-2">{error}</Text> : null}
    </View>
  );
}
