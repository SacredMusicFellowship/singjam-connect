import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { jamSetListName, linkableSets, type LinkableSet } from '@singjam/core';
import { setApi } from '@/lib/setApi';

type LinkedSet = { id: string; short_code?: string | null; name: string };

// Native counterpart to web's JamSetList: the jam's set list, and for a host or
// co-host, creating one, linking an existing set, or unlinking it. Every write
// goes through the same web API routes web uses.
export default function JamSetList({ jamId, jamName, canManage }: { jamId: string; jamName: string | null; canManage: boolean }) {
  const router = useRouter();
  const [set, setSet] = useState<LinkedSet | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [availableSets, setAvailableSets] = useState<LinkableSet[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setApi(`/api/jam/${jamId}/set`, 'GET')
      .then(({ ok, json }) => setSet(ok ? json?.set ?? null : null))
      .catch(() => setSet(null));
  }, [jamId]);

  function openSet(id: string) {
    router.push({ pathname: '/set/[id]' as any, params: { id } });
  }

  async function handleCreate() {
    setCreating(true);
    setError(null);
    const { ok, json } = await setApi('/api/sets', 'POST', { name: jamSetListName(jamName), jamId });
    setCreating(false);
    if (!ok) {
      setError(json?.error ?? "Couldn't create a set list. Please try again.");
      return;
    }
    setSet({ id: json.id, short_code: json.short_code, name: jamSetListName(jamName) });
    openSet(json.id);
  }

  async function handleShowLink() {
    setLinking(true);
    setError(null);
    if (availableSets) return;
    const { ok, json } = await setApi('/api/sets', 'GET');
    setAvailableSets(ok ? linkableSets(json?.owned ?? [], json?.collaborating ?? [], jamId) : []);
  }

  async function handleUnlink() {
    const prev = set;
    setSet(null);
    const { ok } = await setApi(`/api/jam/${jamId}/set`, 'DELETE');
    if (!ok) {
      setSet(prev);
      setError("Couldn't unlink the set list. Please try again.");
    }
  }

  function choose(chosen: LinkableSet) {
    if (!chosen.linkedElsewhere) {
      link(chosen, 'link');
      return;
    }
    Alert.alert(
      `${chosen.name} is already the set list for ${chosen.jam_name ?? 'another jam'}`,
      'A set list can only belong to one jam, so moving it here removes it from that one. A copy keeps both.',
      [
        { text: 'Link a copy', onPress: () => link(chosen, 'copy') },
        { text: 'Move it here', onPress: () => link(chosen, 'move') },
        { text: 'Back', style: 'cancel' },
      ],
    );
  }

  async function link(chosen: LinkableSet, mode: 'link' | 'move' | 'copy') {
    setError(null);
    setBusy(true);
    let target: LinkedSet = { id: chosen.id, short_code: chosen.short_code, name: chosen.name };
    if (mode === 'copy') {
      const copy = await setApi(`/api/sets/${chosen.id}/copy`, 'POST');
      if (!copy.ok) {
        setBusy(false);
        setError("Couldn't copy that set list. Please try again.");
        return;
      }
      target = { id: copy.json.id, short_code: copy.json.short_code, name: `Copy of ${chosen.name}` };
    }
    const { ok, json } = await setApi(`/api/jam/${jamId}/set`, 'PUT', { setId: target.id, move: mode === 'move' });
    setBusy(false);
    if (!ok) {
      setError(json?.error ?? "Couldn't link that set list. Please try again.");
      return;
    }
    setLinking(false);
    setAvailableSets(null);
    setSet(target);
  }

  if (set === undefined) return null;
  if (!canManage && !set) return null;

  return (
    <View className="px-4 mb-10" testID="jam-set-list">
      <Text className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Set list</Text>
      {set ? (
        <View className="flex-row items-center">
          <TouchableOpacity
            onPress={() => openSet(set.id)}
            accessibilityRole="link"
            className="flex-1 flex-row items-center border border-zinc-200 rounded-full px-4 py-2.5"
          >
            <Ionicons name="list-outline" size={16} color="#a1a1aa" style={{ marginRight: 8 }} />
            <Text className="flex-1 text-zinc-700 font-medium" numberOfLines={1}>{set.name}</Text>
            <Ionicons name="arrow-forward" size={16} color="#a1a1aa" />
          </TouchableOpacity>
          {canManage ? (
            <TouchableOpacity onPress={handleUnlink} className="ml-2 border border-zinc-200 rounded-full px-4 py-2.5">
              <Text className="text-zinc-500 font-medium">Unlink</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : linking ? (
        <View>
          {availableSets === null ? (
            <ActivityIndicator color="#d97706" />
          ) : availableSets.length === 0 ? (
            <Text className="text-zinc-500">No set lists found.</Text>
          ) : (
            <>
              <Text className="text-zinc-500 mb-2">Choose a set list</Text>
              <View className="border border-zinc-200 rounded-xl overflow-hidden">
                {availableSets.map((s, i) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => choose(s)}
                    disabled={busy}
                    className={`flex-row items-center px-4 py-3 ${i > 0 ? 'border-t border-zinc-100' : ''}`}
                  >
                    <Text className="flex-1 text-zinc-900" numberOfLines={2}>{s.label}</Text>
                    <Ionicons name="link-outline" size={16} color="#a1a1aa" />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
          <View className="flex-row items-center mt-3">
            <TouchableOpacity
              onPress={() => { setLinking(false); setError(null); }}
              disabled={busy}
              className="border border-zinc-200 rounded-full px-4 py-2"
            >
              <Text className="text-zinc-600 font-medium">Cancel</Text>
            </TouchableOpacity>
            {busy ? <ActivityIndicator color="#d97706" style={{ marginLeft: 12 }} /> : null}
          </View>
        </View>
      ) : (
        <View>
          <Text className="text-zinc-500 mb-3">
            Create a set list for this jam — attendees will be added as collaborators automatically.
          </Text>
          <View className="flex-row flex-wrap">
            <TouchableOpacity
              onPress={handleCreate}
              disabled={creating}
              className={`bg-amber-500 rounded-full px-4 py-2 mr-2 ${creating ? 'opacity-50' : ''}`}
            >
              <Text className="text-white font-semibold">{creating ? 'Creating…' : 'Create set list'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleShowLink} className="border border-zinc-200 rounded-full px-4 py-2">
              <Text className="text-zinc-600 font-medium">Link existing</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      {error ? <Text className="text-red-600 mt-2">{error}</Text> : null}
    </View>
  );
}
