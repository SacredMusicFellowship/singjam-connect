import { useState, useEffect } from 'react';
import {
  View, Text, Modal, TouchableOpacity, FlatList, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '@/lib/supabase';
import { formatJamTime } from '@singjam/core';

type Jam = {
  id: string;
  name: string;
  starts_at: string;
  timezone: string | null;
};

type Props = {
  visible: boolean;
  inviteeUserId: string;
  inviteeName: string;
  onClose: () => void;
};

export default function InviteToJamModal({ visible, inviteeUserId, inviteeName, onClose }: Props) {
  const [jams, setJams] = useState<Jam[]>([]);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSent(new Set());
    setError(null);
    loadJams();
  }, [visible]);

  async function loadJams() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const now = new Date().toISOString();

    // Jams the current user is hosting
    const { data: hosted } = await supabase
      .from('jams')
      .select('id, name, starts_at, timezone')
      .eq('host_user_id', user.id)
      .gte('starts_at', now)
      .order('starts_at');

    // Jams user is attending where guests can invite
    const { data: rsvps } = await supabase
      .from('jam_rsvps')
      .select('jam:jams(id, name, starts_at, timezone, guests_can_invite)')
      .eq('user_id', user.id)
      .eq('status', 'attending')
      .neq('jam.host_user_id', user.id);

    const attended: Jam[] = ((rsvps ?? []) as any[])
      .map(r => r.jam)
      .filter(j => j && j.guests_can_invite && j.starts_at >= now)
      .map(j => ({ id: j.id, name: j.name, starts_at: j.starts_at, timezone: j.timezone }));

    const hostedJams: Jam[] = (hosted ?? []).map((j: any) => ({
      id: j.id, name: j.name, starts_at: j.starts_at, timezone: j.timezone,
    }));

    // Merge + dedup + sort
    const seen = new Set<string>();
    const all: Jam[] = [...hostedJams, ...attended].filter(j => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    }).sort((a, b) => a.starts_at.localeCompare(b.starts_at));

    setJams(all);
    setLoading(false);
  }

  async function handleInvite(jam: Jam) {
    setError(null);
    const { error: insertError } = await supabase
      .from('jam_invites')
      .insert({ jam_id: jam.id, invited_user_id: inviteeUserId, status: 'pending' });

    if (insertError && !insertError.message.includes('duplicate')) {
      setError('Could not send invite. Try again.');
      return;
    }
    setSent(prev => new Set([...prev, jam.id]));
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View className="flex-1 bg-white">
        <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Cancel</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900" numberOfLines={1}>
            Invite {inviteeName}
          </Text>
          <View style={{ width: 54 }} />
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#d97706" />
          </View>
        ) : jams.length === 0 ? (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-zinc-900 font-semibold mb-1">No upcoming jams</Text>
            <Text className="text-zinc-400 text-sm text-center">
              You'll see your hosted jams here once you've created one.
            </Text>
          </View>
        ) : (
          <FlatList
            data={jams}
            keyExtractor={item => item.id}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 40 }}
            ListHeaderComponent={
              error ? (
                <View className="mx-4 my-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <Text className="text-red-600 text-sm">{error}</Text>
                </View>
              ) : undefined
            }
            renderItem={({ item }) => {
              const isSent = sent.has(item.id);
              return (
                <View className="mx-4 mb-2 rounded-xl border border-zinc-100 bg-white px-4 py-3 flex-row items-center">
                  <View className="flex-1 mr-3">
                    <Text className="font-semibold text-zinc-900" numberOfLines={1}>{item.name}</Text>
                    <Text className="text-sm text-zinc-400 mt-0.5">
                      {formatJamTime(item.starts_at, item.timezone)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleInvite(item)}
                    disabled={isSent}
                    className={`rounded-full px-4 py-1.5 ${isSent ? 'bg-green-100' : 'bg-amber-500'}`}
                  >
                    <Text className={`text-sm font-semibold ${isSent ? 'text-green-700' : 'text-white'}`}>
                      {isSent ? 'Sent ✓' : 'Invite'}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )}
      </View>
    </Modal>
  );
}
