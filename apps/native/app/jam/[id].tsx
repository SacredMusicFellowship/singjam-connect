import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Image, Modal, TextInput, FlatList,
  KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canEditJam, dropUsCountry, jamImageFor, dropVenueRepeatedInTitle, formatJamTime, googleMapsUrl, jamIsFull, jamSeatExcludedUserId, jamSeatsTaken } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import { duplicateJam } from '@/lib/jams';
import ContentContainer from '@/components/ContentContainer';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

// RSVP, cancel, invites and invite responses all run the capacity/waitlist
// rules, set-collaborator linking, notifications, and emails server-side. They
// live in the web API routes (single source of truth) and are called here with
// a bearer token instead of being reimplemented against the client.
async function jamApiFetch(path: string, method: 'POST' | 'DELETE', body?: object) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  return fetch(`${WEB_URL}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${session.access_token}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

type GuestAttendee = { name: string; extra: number };

// Music leaders on an official event, served by the web API: jam_leaders is
// service_role-only because each row carries the leader's email and token.
type JamLeader = { id: string; user_id: string | null; name: string; username: string | null; avatar_url: string | null };
type MyLeaderSpot = { token: string; show_publicly: boolean };

type JamDetail = {
  id: string;
  name: string | null;
  visibility: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  neighborhood: string | null;
  full_address: string | null;
  notes: string | null;
  image_url: string | null;
  image_mobile_url: string | null;
  tickets_url: string | null;
  capacity: number | null;
  host_id: string | null;
  host_display_name: string | null;
  host_username: string | null;
  host_avatar: string | null;
  genres: string[];
};

type Attendee = {
  user_id: string;
  status: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
};

type JamSet = {
  id: string;
  name: string;
};

type UserSearchResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

function InviteUsersModal({
  visible,
  jamId,
  attendeeIds,
  onClose,
}: {
  visible: boolean;
  jamId: string;
  attendeeIds: Set<string>;
  onClose: () => void;
}) {
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) return;
    setQuery('');
    setResults([]);
    setSent(new Set());
    supabase.auth.getUser().then(({ data: { user } }) => setMyUserId(user?.id ?? null));
  }, [visible]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    searchTimer.current = setTimeout(() => runSearch(q), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  async function runSearch(q: string) {
    if (!myUserId) return;
    setSearching(true);
    const { data } = await supabase.rpc('search_users', {
      search_query: q.startsWith('@') ? q.slice(1) : q,
      exclude_user_id: myUserId,
    });
    setResults(data ?? []);
    setSearching(false);
  }

  async function handleInvite(userId: string) {
    setPending(userId);
    const res = await jamApiFetch(`/api/jam/${jamId}/invite`, 'POST', { inviteeUserId: userId });
    // 409 means they already have an invite, which is what the button promised.
    if (res?.ok || res?.status === 409) {
      setSent(prev => new Set([...prev, userId]));
    } else {
      const msg = res ? (await res.json().catch(() => null))?.error : null;
      Alert.alert('Error', msg ?? 'Something went wrong.');
    }
    setPending(null);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 bg-white"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-row items-center px-4 pt-4 pb-3 border-b border-zinc-100">
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text className="text-amber-600 font-medium">Done</Text>
          </TouchableOpacity>
          <Text className="flex-1 text-center font-semibold text-zinc-900">Invite people</Text>
          <View style={{ width: 50 }} />
        </View>

        <View className="px-4 py-3 border-b border-zinc-100">
          <View className="flex-row items-center bg-zinc-100 rounded-xl px-3 py-2">
            <Text className="text-zinc-400 mr-2">🔍</Text>
            <TextInput
              className="flex-1 text-zinc-900"
              placeholder="Search by name or @username…"
              placeholderTextColor="#a1a1aa"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoFocus
              returnKeyType="search"
            />
            {query.length > 0 ? (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Text className="text-zinc-400 ml-2">✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {searching ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#d97706" />
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={item => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 40 }}
            ListEmptyComponent={
              query.trim().length >= 2 ? (
                <View className="items-center pt-12">
                  <Text className="text-zinc-400 text-sm">No results for "{query}"</Text>
                </View>
              ) : (
                <View className="items-center pt-12">
                  <Text className="text-zinc-400 text-sm">Search for a jammer to invite</Text>
                </View>
              )
            }
            renderItem={({ item }) => {
              const isAttending = attendeeIds.has(item.id);
              const isSent = sent.has(item.id);
              const isPending = pending === item.id;
              const name = item.display_name ?? item.username ?? 'Unknown';
              const initial = name[0]?.toUpperCase() ?? '?';

              return (
                <View className="flex-row items-center px-4 py-3 border-b border-zinc-100">
                  {item.avatar_url ? (
                    <Image
                      source={{ uri: item.avatar_url }}
                      className="w-9 h-9 rounded-full mr-3"
                    />
                  ) : (
                    <View className="w-9 h-9 rounded-full bg-zinc-200 items-center justify-center mr-3">
                      <Text className="text-zinc-600 font-semibold text-sm">{initial}</Text>
                    </View>
                  )}
                  <View className="flex-1 mr-3">
                    <Text className="text-zinc-900 font-medium" numberOfLines={1}>{name}</Text>
                    {item.username ? (
                      <Text className="text-zinc-400 text-sm mt-0.5">@{item.username}</Text>
                    ) : null}
                  </View>
                  {isAttending ? (
                    <Text className="text-zinc-400 text-xs">Attending</Text>
                  ) : isPending ? (
                    <ActivityIndicator size="small" color="#d97706" />
                  ) : isSent ? (
                    <Text className="text-green-600 text-sm font-semibold">Sent ✓</Text>
                  ) : (
                    <TouchableOpacity
                      onPress={() => handleInvite(item.id)}
                      className="bg-amber-500 rounded-full px-4 py-1.5"
                    >
                      <Text className="text-white text-sm font-semibold">Invite</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            }}
          />
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Wraps the venue lines in a tap target when there is somewhere to send
// people, and passes them straight through when there is not (a TBD venue), so
// an unlinkable location gets no misleading press feedback.
function MaybeMapsLink({ query, children }: { query: string | null; children: React.ReactNode }) {
  const url = googleMapsUrl(query);
  if (!url) return <>{children}</>;
  return (
    <TouchableOpacity
      onPress={() =>
        Linking.openURL(url).catch(() =>
          Alert.alert('Could not open Maps', 'No maps app or browser is available.')
        )
      }
      accessibilityRole="link"
      accessibilityLabel="Open this location in Maps"
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      {children}
    </TouchableOpacity>
  );
}

function AttendeeAvatar({ attendee, isMe, extra = 0 }: { attendee: Attendee; isMe: boolean; extra?: number }) {
  const name = attendee.display_name ?? attendee.username ?? '?';
  const initial = name[0]?.toUpperCase() ?? '?';
  return (
    <View className="items-center mr-3 mb-3" style={{ width: 52 }}>
      {attendee.avatar_url ? (
        <Image source={{ uri: attendee.avatar_url }} className="w-10 h-10 rounded-full mb-1" />
      ) : (
        <View className={`w-10 h-10 rounded-full items-center justify-center mb-1 ${isMe ? 'bg-amber-500' : 'bg-zinc-200'}`}>
          <Text className={`font-semibold text-sm ${isMe ? 'text-white' : 'text-zinc-600'}`}>{initial}</Text>
        </View>
      )}
      <Text className="text-zinc-500 text-xs text-center" numberOfLines={1}>
        {extra > 0
          ? `${attendee.username ? `@${attendee.username}` : name} +${extra}`
          : attendee.username ? `@${attendee.username}` : name}
      </Text>
    </View>
  );
}

function GuestAvatar({ guest }: { guest: GuestAttendee }) {
  const initial = guest.name[0]?.toUpperCase() ?? '?';
  return (
    <View className="items-center mr-3 mb-3" style={{ width: 52 }}>
      <View className="w-10 h-10 rounded-full items-center justify-center mb-1 bg-zinc-200">
        <Text className="font-semibold text-sm text-zinc-600">{initial}</Text>
      </View>
      <Text className="text-zinc-500 text-xs text-center" numberOfLines={1}>
        {guest.extra > 0 ? `${guest.name} +${guest.extra}` : guest.name}
      </Text>
    </View>
  );
}

function InfoRow({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <View className="flex-row items-start mb-3">
      <Text className="text-base mr-3 mt-0.5">{icon}</Text>
      <View className="flex-1">{children}</View>
    </View>
  );
}

export default function JamDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [jam, setJam] = useState<JamDetail | null>(null);
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  // Kept apart from `attendees`: that array drives the capacity check and the
  // RSVP prediction, both of which key on user_id, which a guest has not got.
  const [guestAttendees, setGuestAttendees] = useState<GuestAttendee[]>([]);
  // Tickets an account holder bought beyond their own seat, by user id. Their
  // RSVP row counts them once however many they hold, so without this a couple
  // buying two showed as one person going while a guest buying two showed two.
  const [memberExtras, setMemberExtras] = useState<Record<string, number>>({});
  const [myRsvpStatus, setMyRsvpStatus] = useState<string | null>(null);
  const [myInviteStatus, setMyInviteStatus] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  // Kept so an optimistic RSVP can put you in the attendee list straight away
  // instead of waiting for a reload to learn your own name and avatar.
  const [me, setMe] = useState<Omit<Attendee, 'status'> | null>(null);
  const [canHostOfficial, setCanHostOfficial] = useState(false);
  const [jamSets, setJamSets] = useState<JamSet[]>([]);
  const [leaders, setLeaders] = useState<JamLeader[]>([]);
  const [myLeader, setMyLeader] = useState<MyLeaderSpot | null>(null);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rsvpLoading, setRsvpLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!id) return;
    load();
  }, [id]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    setMyUserId(user?.id ?? null);

    const [jamResult, rsvpsResult, inviteResult, setsResult, meResult] = await Promise.all([
      supabase
        .from('jams')
        .select(`
          id, name, visibility, starts_at, ends_at, timezone,
          neighborhood, full_address, notes, image_url, image_mobile_url, tickets_url, capacity, host_user_id,
          profiles!host_user_id ( display_name, username, avatar_url ),
          jam_genres ( genres ( name ) )
        `)
        .eq('id', id)
        .single(),
      // Unbounded and ordered like web's JamAttendeeList: `attendees.length`
      // drives the attending count and the at-capacity check, so a capped or
      // unordered fetch would understate a full jam.
      supabase
        .from('jam_rsvps')
        .select('status, user_id, profiles!user_id ( display_name, username, avatar_url )')
        .eq('jam_id', id)
        .in('status', ['attending', 'waitlist'])
        .order('created_at', { ascending: true }),
      user
        ? supabase.from('jam_invites').select('status').eq('jam_id', id).eq('invited_user_id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('sets')
        .select('id, name')
        .eq('jam_id', id)
        .limit(10),
      user
        ? supabase.from('profiles').select('display_name, username, avatar_url, can_host_official').eq('id', user.id).single()
        : Promise.resolve({ data: null }),
    ]);

    if (!jamResult.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const j = jamResult.data as any;
    setJam({
      id: j.id,
      name: j.name,
      visibility: j.visibility,
      starts_at: j.starts_at,
      ends_at: j.ends_at,
      timezone: j.timezone,
      neighborhood: j.neighborhood,
      full_address: j.full_address,
      notes: j.notes,
      image_url: j.image_url,
      image_mobile_url: j.image_mobile_url,
      tickets_url: j.tickets_url,
      capacity: j.capacity,
      host_id: j.host_user_id,
      host_display_name: j.profiles?.display_name ?? null,
      host_username: j.profiles?.username ?? null,
      host_avatar: j.profiles?.avatar_url ?? null,
      genres: (j.jam_genres ?? []).map((jg: any) => jg.genres?.name).filter(Boolean),
    });

    const rawRsvps: Attendee[] = (rsvpsResult.data ?? []).map((r: any) => ({
      user_id: r.user_id,
      status: r.status,
      display_name: r.profiles?.display_name ?? null,
      username: r.profiles?.username ?? null,
      avatar_url: r.profiles?.avatar_url ?? null,
    }));

    setAttendees(rawRsvps.filter(r => r.status === 'attending'));

    // Ticket buyers without an account. Served by the web API because tickets is
    // service_role-only, so the app's Supabase client cannot read them. Failing
    // quietly is right: a missing guest row shouldn't blank the whole screen.
    fetch(`${WEB_URL}/api/jam/${id}/attendees/guests`)
      .then(r => (r.ok ? r.json() : { guests: [], members: [] }))
      .then(d => {
        setGuestAttendees(d.guests ?? []);
        setMemberExtras(
          Object.fromEntries(
            ((d.members ?? []) as { user_id: string; extra: number }[]).map(m => [m.user_id, m.extra])
          )
        );
      })
      .catch(() => { setGuestAttendees([]); setMemberExtras({}); });
    if (j.visibility === 'official') {
      const { data: { session } } = await supabase.auth.getSession();
      fetch(`${WEB_URL}/api/jam/${id}/leaders`, {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
        .then(r => (r.ok ? r.json() : { leaders: [], me: null }))
        .then(d => { setLeaders(d.leaders ?? []); setMyLeader(d.me ?? null); })
        .catch(() => { setLeaders([]); setMyLeader(null); });
    } else {
      setLeaders([]);
      setMyLeader(null);
    }

    const myRsvp = user ? rawRsvps.find(r => r.user_id === user.id) : undefined;
    setMyRsvpStatus(myRsvp?.status ?? null);
    if (user) {
      const p = meResult.data as any;
      setMe({
        user_id: user.id,
        display_name: p?.display_name ?? null,
        username: p?.username ?? null,
        avatar_url: p?.avatar_url ?? null,
      });
      setCanHostOfficial(p?.can_host_official === true);
    }
    setMyInviteStatus(inviteResult.data?.status ?? null);
    setJamSets((setsResult.data ?? []).map((s: any) => ({ id: s.id, name: s.name })));
    setLoading(false);
  }

  // These three used to block on the write and then on a full reload before
  // anything moved — two round-trips of dead button on the most-tapped control
  // in the app. They now paint the expected outcome first and reconcile after.
  //
  // The server owns the capacity rule, so the optimistic status is a prediction
  // using the same test it applies; the response carries the authoritative
  // status and corrects it. The reload still runs, but in the background, since
  // a cancel can promote someone off the waitlist and only the server knows who.
  function predictedRsvpStatus(): 'attending' | 'waitlist' {
    if (!jam) return 'attending';
    const capacityJam = { capacity: jam.capacity, host_user_id: jam.host_id, visibility: jam.visibility };
    return jamIsFull(capacityJam, attendees.filter(a => a.user_id !== jam.host_id).length) ? 'waitlist' : 'attending';
  }

  async function handleRsvp() {
    if (!jam) return;
    if (!myUserId) { router.push('/(auth)/sign-in' as any); return; }
    if (jam.visibility === 'official') {
      Alert.alert('External ticketing', 'Official SingJam events use external ticketing.');
      return;
    }

    const previousStatus = myRsvpStatus;
    const previousAttendees = attendees;
    const predicted = predictedRsvpStatus();

    setRsvpLoading(true);
    setMyRsvpStatus(predicted);
    if (predicted === 'attending' && me && !attendees.some(a => a.user_id === me.user_id)) {
      setAttendees(prev => [...prev, { ...me, status: 'attending' }]);
    }

    const res = await jamApiFetch(`/api/jam/${jam.id}/rsvp`, 'POST');
    if (!res?.ok) {
      const msg = res ? (await res.json().catch(() => null))?.error : null;
      Alert.alert('Error', msg ?? 'Something went wrong.');
      setMyRsvpStatus(previousStatus);
      setAttendees(previousAttendees);
      setRsvpLoading(false);
      return;
    }

    const confirmed = (await res.json().catch(() => null))?.status;
    if (confirmed && confirmed !== predicted) setMyRsvpStatus(confirmed);
    setRsvpLoading(false);
    load();
  }

  // Same endpoint as the "Manage your spot" link in the leader's email.
  async function leaderAction(action: 'withdraw' | 'hide' | 'show') {
    if (!myLeader) return false;
    const res = await fetch(`${WEB_URL}/api/lead/${myLeader.token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    if (!res?.ok) {
      Alert.alert('Error', 'Something went wrong.');
      return false;
    }
    return true;
  }

  async function handleLeaderVisibility() {
    if (!myLeader) return;
    const show = !myLeader.show_publicly;
    if (await leaderAction(show ? 'show' : 'hide')) load();
  }

  function handleLeaderWithdraw() {
    Alert.alert("Can't make it?", "Your ticket will be released and we'll let the host know.", [
      {
        text: "Yes, I can't make it",
        style: 'destructive',
        onPress: async () => {
          if (await leaderAction('withdraw')) load();
        },
      },
      { text: 'Keep my spot', style: 'cancel' },
    ]);
  }

  async function handleCancelRsvp() {
    if (!myUserId || !jam) return;
    Alert.alert('Cancel RSVP', 'Are you sure you want to cancel your RSVP?', [
      {
        text: 'Cancel RSVP',
        style: 'destructive',
        onPress: async () => {
          const previousStatus = myRsvpStatus;
          const previousAttendees = attendees;

          setRsvpLoading(true);
          setMyRsvpStatus(null);
          setAttendees(prev => prev.filter(a => a.user_id !== myUserId));

          const res = await jamApiFetch(`/api/jam/${jam.id}/rsvp`, 'DELETE');
          if (!res?.ok) {
            Alert.alert('Error', 'Something went wrong.');
            setMyRsvpStatus(previousStatus);
            setAttendees(previousAttendees);
            setRsvpLoading(false);
            return;
          }
          setRsvpLoading(false);
          load();
        },
      },
      { text: 'Keep RSVP', style: 'cancel' },
    ]);
  }

  async function handleInviteResponse(response: 'accepted' | 'declined') {
    if (!myUserId || !jam) return;

    const previousInvite = myInviteStatus;
    const previousAttendees = attendees;

    setRsvpLoading(true);
    setMyInviteStatus(response);
    if (response === 'accepted' && me && !attendees.some(a => a.user_id === me.user_id)) {
      setAttendees(prev => [...prev, { ...me, status: 'attending' }]);
    }

    const res = await jamApiFetch(`/api/jam/${jam.id}/invite/respond`, 'POST', { response });
    if (!res?.ok) {
      Alert.alert('Error', 'Something went wrong.');
      setMyInviteStatus(previousInvite);
      setAttendees(previousAttendees);
      setRsvpLoading(false);
      return;
    }
    setRsvpLoading(false);
    load();
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <View className="flex-1 bg-white items-center justify-center">
          <ActivityIndicator color="#d97706" />
        </View>
      </>
    );
  }

  if (notFound || !jam) {
    return (
      <>
        <Stack.Screen options={{ title: 'Jam' }} />
        <View className="flex-1 bg-white items-center justify-center">
          <Text className="text-zinc-400">Jam not found</Text>
        </View>
      </>
    );
  }

  async function handleDuplicate() {
    if (!jam || !myUserId) return;
    const newId = await duplicateJam(jam.id, myUserId);
    if (!newId) { Alert.alert('Error', 'Could not duplicate jam.'); return; }
    router.push({ pathname: '/jam/[id]' as any, params: { id: newId } });
  }

  const isHosting = jam.host_id === myUserId;
  const canEdit = !!myUserId && canEditJam({ host_user_id: jam.host_id, visibility: jam.visibility }, { id: myUserId, can_host_official: canHostOfficial });
  // The host holds a seat but has no RSVP row; on web's list they are the
  // first person going, and the capacity count includes them the same way.
  const capacityJam = { capacity: jam.capacity, host_user_id: jam.host_id, visibility: jam.visibility };
  // On an official event nobody is filtered: the creator's RSVP is an ordinary one.
  const excludedUserId = jamSeatExcludedUserId(capacityJam);
  const othersGoing = attendees.filter(a => a.user_id !== excludedUserId);
  const seatsTaken = jamSeatsTaken(capacityJam, othersGoing.length);
  const isFull = jamIsFull(capacityJam, othersGoing.length);
  const going: Attendee[] = jam.host_id && jam.visibility !== 'official'
    ? [{ user_id: jam.host_id, status: 'attending', display_name: jam.host_display_name, username: jam.host_username, avatar_url: jam.host_avatar }, ...othersGoing]
    : othersGoing;
  const timeStr = formatJamTime(jam.starts_at, jam.timezone);
  const isPast = jam.starts_at ? new Date(jam.starts_at) < new Date() : false;
  const hasFullAccess = isHosting || myRsvpStatus === 'attending' || myInviteStatus === 'accepted' || jam.visibility === 'official' || jam.visibility === 'private';

  const attendeeIds = new Set(attendees.map(a => a.user_id));
  // One order can cover several people under a single name, so heads and rows differ.
  const guestHeadcount = guestAttendees.reduce((n, g) => n + 1 + g.extra, 0);
  // Only for attendees who have a row: inflating the total from someone nobody
  // can see is how a headcount stops being explainable. Mirrors web's
  // JamAttendeeList.
  const memberHeadcount = going.reduce((n, a) => n + (memberExtras[a.user_id] ?? 0), 0);

  return (
    <>
      <InviteUsersModal
        visible={inviteModalVisible}
        jamId={jam.id}
        attendeeIds={attendeeIds}
        onClose={() => setInviteModalVisible(false)}
      />
      <Stack.Screen
        options={{
          title: jam.name ?? 'Jam',
          headerTintColor: '#d97706',
          headerRight: canEdit ? () => (
            <View className="flex-row gap-4">
              <TouchableOpacity onPress={handleDuplicate} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Ionicons name="copy-outline" size={20} color="#71717a" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push({ pathname: '/jam/edit' as any, params: { id: jam.id } })}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="pencil-outline" size={20} color="#d97706" />
              </TouchableOpacity>
            </View>
          ) : undefined,
        }}
      />
      <ContentContainer style={{ backgroundColor: 'white' }}>
      <ScrollView className="flex-1 bg-white">

        {/* Header image or date block */}
        {jam.image_url ? (
          // The host's 3:2 mobile crop, the same one mobile web shows. Native
          // Image has no object-position, so an event without one is
          // centre-cropped rather than cropped around its focal point.
          <Image
            source={{ uri: jamImageFor(jam, 'mobile')!.src }}
            className="w-full"
            style={{ aspectRatio: 3 / 2 }}
            resizeMode="cover"
          />
        ) : jam.starts_at ? (
          <View className="bg-amber-50 items-center justify-center py-10">
            <Text className="text-amber-400 text-sm font-medium uppercase tracking-wide mb-1">
              {new Date(jam.starts_at).toLocaleString('en', { weekday: 'long', ...(jam.timezone ? { timeZone: jam.timezone } : {}) })}
            </Text>
            <Text className="text-amber-700 text-5xl font-bold">
              {new Date(jam.starts_at).toLocaleString('en', { day: 'numeric', ...(jam.timezone ? { timeZone: jam.timezone } : {}) })}
            </Text>
            <Text className="text-amber-500 text-lg font-medium">
              {new Date(jam.starts_at).toLocaleString('en', { month: 'long', year: 'numeric', ...(jam.timezone ? { timeZone: jam.timezone } : {}) })}
            </Text>
          </View>
        ) : null}

        {/* Title + badges */}
        <View className="px-4 pt-5 pb-2">
          <Text className="text-2xl font-bold text-zinc-900 mb-1">{jam.name ?? 'Jam Session'}</Text>
          <View className="flex-row flex-wrap gap-2">
            {/* No "Official SingJam Event" badge or "Hosted by SingJam" row on an
                official event: the title and image already say so. Mirrors web. */}
            {jam.visibility === 'community' ? (
              <View className="bg-zinc-100 rounded-full px-3 py-0.5">
                <Text className="text-zinc-500 text-xs font-medium">Community</Text>
              </View>
            ) : null}
            {isPast ? (
              <View className="bg-zinc-100 rounded-full px-3 py-0.5">
                <Text className="text-zinc-500 text-xs font-medium">Past event</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Info rows */}
        <View className="px-4 py-4">
          {timeStr ? (
            <InfoRow icon="📅">
              <Text className="text-zinc-700">{timeStr}</Text>
            </InfoRow>
          ) : null}

          {jam.neighborhood || jam.full_address ? (
            <InfoRow icon="📍">
              {/* Tapping the venue opens Maps, matching mobile web. Pointed at
                  the most precise line this viewer is actually shown, so it
                  cannot leak an address the screen withholds until RSVP. */}
              <MaybeMapsLink
                query={hasFullAccess ? jam.full_address ?? jam.neighborhood : jam.neighborhood}
              >
                {jam.neighborhood ? (
                  <Text className="text-zinc-700 font-medium">{dropUsCountry(jam.neighborhood)}</Text>
                ) : null}
                {jam.full_address && hasFullAccess ? (
                  <Text className="text-zinc-400 text-sm mt-0.5">{dropUsCountry(dropVenueRepeatedInTitle(jam.full_address, jam.name))}</Text>
                ) : jam.full_address && !hasFullAccess ? (
                  <Text className="text-zinc-400 text-sm mt-0.5 italic">Full address shown after RSVP</Text>
                ) : null}
              </MaybeMapsLink>
            </InfoRow>
          ) : null}

          {/* Official events belong to SingJam, so whoever created the row is
              never credited personally, and there is no "Hosted by SingJam" row
              either — mirrors web's JamCard. */}
          {jam.visibility !== 'official' && !isHosting && (jam.host_display_name || jam.host_username) ? (
            <InfoRow icon="🎤">
              <Text className="text-zinc-700">
                Hosted by{' '}
                <Text className="font-medium">{jam.host_display_name ?? `@${jam.host_username}`}</Text>
                {jam.host_username ? (
                  <Text className="text-zinc-400"> @{jam.host_username}</Text>
                ) : null}
              </Text>
            </InfoRow>
          ) : null}

          {jam.genres.length > 0 ? (
            <InfoRow icon="🎵">
              <View className="flex-row flex-wrap gap-1">
                {jam.genres.map(g => (
                  <View key={g} className="bg-zinc-100 rounded-full px-3 py-0.5">
                    <Text className="text-zinc-500 text-sm">{g}</Text>
                  </View>
                ))}
              </View>
            </InfoRow>
          ) : null}

          {jam.capacity !== null ? (
            <InfoRow icon="👥">
              <Text className="text-zinc-700">
                {seatsTaken}{jam.capacity ? ` of ${jam.capacity}` : ''} attending
                {isFull ? ' · Full — join waitlist' : ''}
              </Text>
            </InfoRow>
          ) : othersGoing.length > 0 ? (
            <InfoRow icon="👥">
              <Text className="text-zinc-700">{seatsTaken} attending</Text>
            </InfoRow>
          ) : null}
        </View>

        {myLeader && !isPast ? (
          <View className="px-4 mb-6">
            <View className="bg-amber-50 rounded-xl p-4 border border-amber-200 gap-2">
              <Text className="text-amber-900 font-medium">You're leading at this event. Thank you! 🎶</Text>
              <View className="flex-row flex-wrap gap-x-4 gap-y-1">
                <TouchableOpacity onPress={handleLeaderVisibility}>
                  <Text className="text-zinc-600 underline">
                    {myLeader.show_publicly ? 'Hide me on the event page' : 'Show me on the event page'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleLeaderWithdraw}>
                  <Text className="text-zinc-600 underline">Can't make it?</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}

        {/* RSVP action */}
        {!isPast ? (
          <View className="px-4 mb-6">
            {isHosting ? (
              <View className="gap-2">
                <View className="bg-amber-50 rounded-xl py-3 items-center border border-amber-200">
                  <Text className="text-amber-700 font-semibold">You're hosting this jam</Text>
                </View>
                <TouchableOpacity
                  onPress={() => setInviteModalVisible(true)}
                  className="border border-amber-300 rounded-xl py-3 flex-row items-center justify-center gap-2"
                >
                  <Ionicons name="person-add-outline" size={16} color="#d97706" />
                  <Text className="text-amber-700 font-medium">Invite people</Text>
                </TouchableOpacity>
              </View>
            ) : myInviteStatus === 'pending' ? (
              <View className="flex-row gap-3">
                <TouchableOpacity
                  onPress={() => handleInviteResponse('accepted')}
                  disabled={rsvpLoading}
                  className="flex-1 bg-amber-500 rounded-xl py-3 items-center"
                >
                  {rsvpLoading ? <ActivityIndicator color="#fff" /> : (
                    <Text className="text-white font-semibold">Accept</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleInviteResponse('declined')}
                  disabled={rsvpLoading}
                  className="flex-1 border border-zinc-200 rounded-xl py-3 items-center"
                >
                  <Text className="text-zinc-600 font-semibold">Decline</Text>
                </TouchableOpacity>
              </View>
            ) : myRsvpStatus === 'attending' || myInviteStatus === 'accepted' ? (
              <TouchableOpacity
                onPress={handleCancelRsvp}
                disabled={rsvpLoading}
                className="border border-zinc-200 rounded-xl py-3 items-center"
              >
                {rsvpLoading ? <ActivityIndicator color="#a1a1aa" /> : (
                  <Text className="text-zinc-600 font-semibold">✓ Going · Cancel RSVP</Text>
                )}
              </TouchableOpacity>
            ) : myRsvpStatus === 'waitlist' ? (
              <View className="bg-blue-50 rounded-xl py-3 items-center border border-blue-200">
                <Text className="text-blue-700 font-semibold">You're on the waitlist</Text>
              </View>
            ) : (
              <TouchableOpacity
                onPress={handleRsvp}
                disabled={rsvpLoading}
                className="bg-amber-500 rounded-xl py-3 items-center"
              >
                {rsvpLoading ? <ActivityIndicator color="#fff" /> : (
                  <Text className="text-white font-semibold">{isFull ? 'Join Waitlist' : 'RSVP'}</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        ) : null}

        {/* Notes */}
        {jam.notes ? (
          <View className="px-4 mb-6">
            <Text className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">About</Text>
            <Text className="text-zinc-700 leading-relaxed">{jam.notes}</Text>
          </View>
        ) : null}

        {/* Who's leading — after the event details and before who's going,
            the same order as mobile web. */}
        {leaders.length > 0 ? (
          <View className="px-4 mb-6">
            <Text className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Leading</Text>
            <View className="gap-2">
              {leaders.map(l => (
                <TouchableOpacity
                  key={l.id}
                  disabled={!l.user_id}
                  onPress={() => router.push(`/profile/${l.user_id}` as any)}
                  className="flex-row items-center gap-3"
                >
                  {l.avatar_url ? (
                    <Image source={{ uri: l.avatar_url }} className="w-8 h-8 rounded-full" />
                  ) : (
                    <View className="w-8 h-8 rounded-full items-center justify-center bg-amber-100">
                      <Text className="font-semibold text-xs text-amber-700">{l.name[0]?.toUpperCase() ?? '?'}</Text>
                    </View>
                  )}
                  <Text className="flex-1 text-zinc-900 font-medium" numberOfLines={1}>{l.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {/* Attendees — members and guests together: no account is needed to be
            counted as coming, only to add songs to the set. */}
        {going.length + guestAttendees.length > 0 ? (
          <View className="px-4 mb-6">
            <Text className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
              Attending ({going.length + guestHeadcount + memberHeadcount})
            </Text>
            <View className="flex-row flex-wrap">
              {going.slice(0, 20).map(a => (
                <AttendeeAvatar
                  key={a.user_id}
                  attendee={a}
                  isMe={a.user_id === myUserId}
                  extra={memberExtras[a.user_id] ?? 0}
                />
              ))}
              {guestAttendees.slice(0, Math.max(0, 20 - going.length)).map((g, i) => (
                <GuestAvatar key={`guest-${i}`} guest={g} />
              ))}
              {going.length + guestAttendees.length > 20 ? (
                <View className="items-center mr-3 mb-3" style={{ width: 52 }}>
                  <View className="w-10 h-10 rounded-full bg-zinc-100 items-center justify-center mb-1">
                    <Text className="text-zinc-400 text-xs font-medium">
                      +{going.length + guestAttendees.length - 20}
                    </Text>
                  </View>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {/* Associated sets */}
        {jamSets.length > 0 ? (
          <View className="px-4 mb-10">
            <Text className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">
              Sets
            </Text>
            {jamSets.map(s => (
              <TouchableOpacity
                key={s.id}
                onPress={() => router.push(`/set/${s.id}` as any)}
                className="flex-row items-center py-3 border-b border-zinc-100"
              >
                <Ionicons name="list-outline" size={16} color="#a1a1aa" style={{ marginRight: 10 }} />
                <Text className="flex-1 text-zinc-900">{s.name}</Text>
                <Ionicons name="chevron-forward" size={16} color="#a1a1aa" />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
      </ContentContainer>
    </>
  );
}
