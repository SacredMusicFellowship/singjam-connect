import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, SectionList, RefreshControl, TouchableOpacity,
  Alert,
} from 'react-native';
import type { GestureResponderEvent } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { canEditJam, fetchAllRows, summarizeTicketTiers, type JamTicketTier } from '@singjam/core';
import { supabase } from '@/lib/supabase';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import { readCache, writeCache } from '@/lib/cache';
import { duplicateJam } from '@/lib/jams';
import JamCard, { type JamItem } from '@/components/JamCard';
import BrandHeader from '@/components/BrandHeader';
import ContentContainer from '@/components/ContentContainer';
import PromptCard from '@/components/PromptCard';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

type Section = { title: string; data: JamItem[]; hosting?: boolean };

// Section logic mirrors web's JamsContent. Pure so cached items can be
// re-sectioned at hydrate time (past/upcoming shifts as time passes).
function buildSections(items: JamItem[], uid: string | null): Section[] {
  const now = new Date().toISOString();
  const isUpcoming = (j: JamItem) => (j.ends_at ?? j.starts_at ?? '') >= now;

  const hosting = uid
    ? items.filter(j => j.visibility !== 'official' && j.host_id === uid && isUpcoming(j))
    : [];
  const upcomingOfficial = items.filter(j => j.visibility === 'official' && isUpcoming(j));
  const invitations = uid
    ? items.filter(j => j.host_id !== uid && j.invite_status === 'pending' && isUpcoming(j))
    : [];
  const community = uid
    ? items.filter(j =>
        j.visibility === 'community' && j.host_id !== uid &&
        j.invite_status !== 'pending' && isUpcoming(j)
      )
    : [];
  const privateJams = uid
    ? items.filter(j => {
        if (j.visibility !== 'private' || j.host_id === uid || !isUpcoming(j)) return false;
        if (j.invite_status === 'accepted' || j.invite_status === 'declined') return true;
        // A guest who arrived on a link has no invite row — their RSVP is the
        // only thing tying them to the jam. Mirrors web's JamsContent.
        return j.rsvp_status === 'attending' || j.rsvp_status === 'waitlist';
      })
    : [];
  const past = [...items].reverse().filter(j => {
    if (isUpcoming(j)) return false;
    if (j.visibility === 'official') return true;
    if (!uid) return false;
    if (j.host_id === uid) return true;
    if (j.rsvp_status) return true;
    return j.invite_status === 'accepted' || j.invite_status === 'declined';
  });

  const built: Section[] = [];
  if (uid) built.push({ title: "Jams you're hosting", data: hosting, hosting: true });
  if (upcomingOfficial.length > 0) built.push({ title: 'Upcoming SingJam events', data: upcomingOfficial });
  if (invitations.length > 0) built.push({ title: 'Invitations', data: invitations });
  if (community.length > 0) built.push({ title: 'Community jams', data: community });
  if (privateJams.length > 0) built.push({ title: 'Private jams', data: privateJams });
  if (past.length > 0) built.push({ title: 'Past events', data: past });
  return built;
}

function SkeletonCard() {
  return (
    <View className="mx-4 mb-3 flex-row overflow-hidden rounded-2xl border border-zinc-100 bg-white">
      <View className="w-20 bg-zinc-100" />
      <View className="flex-1 justify-center gap-2 p-4">
        <View className="h-4 w-3/4 rounded bg-zinc-200" />
        <View className="h-3 w-1/2 rounded bg-zinc-100" />
        <View className="h-3 w-2/3 rounded bg-zinc-100" />
      </View>
    </View>
  );
}

export default function JamsScreen() {
  const [sections, setSections] = useState<Section[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [canHostOfficial, setCanHostOfficial] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const router = useRouter();

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);

    const { data: { user } } = await supabase.auth.getUser();
    setUserId(user?.id ?? null);

    // Same 90-day lookback as web's JamsContent
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - 90);

    const [jamsResult, rsvpsResult, invitesResult, profileResult] = await Promise.all([
      fetchAllRows<any>((from, to) =>
        supabase
          .from('jams')
          .select(`
            id, name, visibility, starts_at, ends_at, timezone,
            neighborhood, notes, image_url, tickets_url, capacity, host_user_id,
            profiles!host_user_id ( display_name, username ),
            jam_genres ( genres ( name ) ),
            jam_themes ( themes ( name ) )
          `)
          .gte('starts_at', windowStart.toISOString())
          .order('starts_at', { ascending: true })
          .order('id')
          .range(from, to)
      ).then(
        (data) => ({ data }),
        (err: any) => {
          console.error(`[jams] could not load the jam list: ${err?.message ?? err}`);
          return { data: null };
        }
      ),
      user
        ? supabase.from('jam_rsvps').select('jam_id, status, waitlist_position').eq('user_id', user.id)
        : Promise.resolve({ data: null }),
      user
        ? supabase.from('jam_invites').select('jam_id, status').eq('invited_user_id', user.id)
        : Promise.resolve({ data: null }),
      user
        ? supabase.from('profiles').select('can_host_official').eq('id', user.id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    setCanHostOfficial((profileResult.data as any)?.can_host_official === true);

    const rsvpMap = new Map(
      (rsvpsResult.data ?? []).map((r: any) => [r.jam_id, r])
    );
    const inviteMap = new Map(
      (invitesResult.data ?? []).map((i: { jam_id: string; status: string }) => [i.jam_id, i.status])
    );

    const items: JamItem[] = (jamsResult.data ?? []).map((j: any) => ({
      id: j.id,
      name: j.name,
      visibility: j.visibility,
      starts_at: j.starts_at,
      ends_at: j.ends_at,
      timezone: j.timezone,
      neighborhood: j.neighborhood,
      notes: j.notes,
      image_url: j.image_url,
      tickets_url: j.tickets_url,
      capacity: j.capacity,
      host_id: j.host_user_id,
      host_display_name: j.profiles?.display_name ?? null,
      host_username: j.profiles?.username ?? null,
      tags: [
        ...(j.jam_genres ?? []).map((jg: any) => jg.genres?.name),
        ...(j.jam_themes ?? []).map((jt: any) => jt.themes?.name),
      ].filter(Boolean),
      rsvp_status: rsvpMap.get(j.id)?.status ?? null,
      rsvp_waitlist_position: rsvpMap.get(j.id)?.waitlist_position ?? null,
      invite_status: inviteMap.get(j.id) ?? null,
      ticket_summary: null,
    }));

    // Ticket state is only shown on upcoming official events (web's
    // JamsContent scopes the same call the same way).
    const summaryNow = new Date().toISOString();
    const officialIds = items
      .filter(j => j.visibility === 'official' && (j.ends_at ?? j.starts_at ?? '') >= summaryNow)
      .map(j => j.id);
    if (officialIds.length) {
      const { data: tiers } = await supabase.rpc('jam_ticket_tiers', { jam_ids: officialIds });
      const byJam = summarizeTicketTiers(tiers as JamTicketTier[] | null);
      for (const item of items) item.ticket_summary = byJam.get(item.id) ?? null;
    }

    const uid = user?.id ?? null;
    writeCache('/jams', uid, items);

    const built = buildSections(items, uid);
    setSections(built);
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    // Show cached jams immediately on launch; the focus-effect load() below
    // still runs and silently replaces them (web's sessionStorage hydrate)
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user.id ?? null;
      const cached = await readCache<JamItem[]>('/jams', uid);
      if (cached) {
        const built = buildSections(cached, uid);
        setUserId(uid);
        setSections(built);
        setLoading(false);
      }
    })();
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const isEmpty = !loading && sections.every(s => s.data.length === 0);

  // Host card ⋯ menu — mirrors web's JamListCard overflow menu (Edit / Copy /
  // Cancel). Cancel routes through the web DELETE endpoint so attendees are
  // notified + emailed (single source of truth).
  function openJamMenu(jam: JamItem, event: GestureResponderEvent) {
    showOptionsSheet({
      title: jam.name ?? 'Jam',
      cancelLabel: 'Close',
      anchor: anchorFrom(event),
      options: [
        { label: 'Edit details', onPress: () => editJam(jam) },
        { label: 'Copy event', onPress: () => copyJam(jam) },
        { label: 'Cancel jam', destructive: true, onPress: () => confirmCancel(jam) },
      ],
    });
  }

  function editJam(jam: JamItem) {
    router.push({ pathname: '/jam/edit' as any, params: { id: jam.id } });
  }

  async function copyJam(jam: JamItem) {
    if (!userId) return;
    const newId = await duplicateJam(jam.id, userId);
    if (newId) router.push({ pathname: '/jam/[id]', params: { id: newId } });
    else Alert.alert('Copy failed', 'Something went wrong copying this jam.');
  }

  function confirmCancel(jam: JamItem) {
    Alert.alert('Cancel this jam?', "This can't be undone. Attendees will be notified.", [
      { text: 'Keep it', style: 'cancel' },
      {
        text: 'Yes, cancel',
        style: 'destructive',
        onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) return;

          // Drop the row now and put it back if the call fails, rather than
          // leaving it on screen for a round-trip plus a full list refetch.
          const previous = sections;
          setSections(prev => prev
            .map(s => ({ ...s, data: s.data.filter(j => j.id !== jam.id) }))
            .filter(s => s.data.length > 0));

          const res = await fetch(`${WEB_URL}/api/jam/${jam.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) load();
          else {
            setSections(previous);
            Alert.alert('Cancel failed', 'Something went wrong cancelling this jam.');
          }
        },
      },
    ]);
  }

  return (
    <View className="flex-1 bg-slate-50">
      <BrandHeader />
      <ContentContainer>
      <View className="border-b border-zinc-100 bg-white px-4 pb-3 pt-4">
        <Text className="text-2xl font-bold text-zinc-900">Jams</Text>
        <Text className="mt-0.5 text-sm text-zinc-500">Browse open jams or post your own.</Text>
      </View>

      {loading ? (
        <View className="pt-4">
          {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <JamCard
              jam={item}
              myId={userId}
              canEdit={!!userId && canEditJam({ host_user_id: item.host_id, visibility: item.visibility }, { id: userId, can_host_official: canHostOfficial })}
              onPress={() => router.push({ pathname: '/jam/[id]', params: { id: item.id } })}
              onManage={(e) => openJamMenu(item, e)}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View className="px-4 pb-2 pt-5">
              <Text className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {section.title}
              </Text>
            </View>
          )}
          renderSectionFooter={({ section }) =>
            section.hosting ? (
              <TouchableOpacity
                onPress={() => router.push('/jam/new' as any)}
                className="mx-4 mb-3 items-center rounded-2xl border-2 border-dashed border-zinc-200 py-6"
              >
                <View className="flex-row items-center" style={{ gap: 6 }}>
                  <Ionicons name="add" size={16} color="#71717a" />
                  <Text className="text-sm text-zinc-500">Post a jam</Text>
                </View>
              </TouchableOpacity>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="#d97706"
            />
          }
          // Web order: the guest pitch, then the "nothing here yet" card — the
          // latter signed-in only, since a guest already has the pitch. Both sit
          // below the sections so the hosting section (and with it the only
          // "Post a jam" affordance) stays on screen on an empty account.
          ListFooterComponent={
            !userId ? (
              <View className="mt-4">
                <PromptCard
                  variant="guest"
                  title="Join the session"
                  body="Sign in to RSVP to community jams, post your own, and get invited to private sessions by other musicians."
                  actionLabel="Sign in →"
                  onAction={() => router.push('/(auth)/sign-in' as any)}
                />
              </View>
            ) : isEmpty ? (
              <View className="mx-4 mt-4 rounded-2xl border border-zinc-200 bg-white p-8 items-center">
                <Text className="text-sm text-zinc-500 text-center">
                  No jams yet. Be the first to post one!
                </Text>
              </View>
            ) : null
          }
          stickySectionHeadersEnabled={false}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
      </ContentContainer>
    </View>
  );
}
