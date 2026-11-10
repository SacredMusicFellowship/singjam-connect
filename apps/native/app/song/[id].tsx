import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator,
  Linking, Alert, Image, Animated,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import YouTubePlayer from '@/components/YouTubePlayer';
import ChordChartControls from '@/components/ChordChartControls';
import {
  browsePath,
  songTagRefs,
  sortByLastName,
  fetchSongJammers,
  type SongJammer,
  type SongJammers,
  CONFIDENCE_STYLES,
  type ConfidenceLevel,
  productionCredits,
  type ProductionCredit,
  sortRecordingsByYear,
  knownTuneHint,
  NO_MELODIES,
  type SongMelodies as Melodies,
  enrichmentInProgress,
  ENRICHMENT_WAIT_MS,
  songCreditLines,
  type CreditTextRef,
  type CreditTune,
  bylineCredits,
  formatJammers,
  songTagNames,
  TAG_TYPE_LABELS,
  type SongTagRow,
  type TagContext,
} from '@singjam/core';
import { supabase } from '@/lib/supabase';
import { nativeBrowseHref } from '@/lib/browseLinks';
import CreditText from '@/components/CreditText';
import { ensureLeadVoice } from '@/lib/leadVoice';
import SongMelodies from '@/components/SongMelodies';
import { showOptionsSheet, anchorFrom } from '@/lib/actionSheet';
import AddToSetModal from '@/components/AddToSetModal';
import ContentContainer from '@/components/ContentContainer';
import PromptCard from '@/components/PromptCard';
import MySongNotes from '@/components/MySongNotes';
import KeyPicker from '@/components/KeyPicker';
import UgBackTip from '@/components/UgBackTip';
import RolePill from '@/components/RolePill';
import MyKeyChip from '@/components/MyKeyChip';

const WEB_URL = process.env.EXPO_PUBLIC_WEB_URL ?? 'https://singjam.org';

// ── Types ─────────────────────────────────────────────────────────────────────

type RecordingArtist = {
  name: string;
  slug?: string | null;
  year: number | null;
  youtube_url: string | null;
  spotify_url: string | null;
};

type SongDetail = {
  id: string;
  slug: string | null;
  title: string;
  display_artist: string | null;
  byline: string | null;
  first_line: string | null;
  hook: string | null;
  notes: string | null;
  genius_url: string | null;
  chord_chart_url: string | null;
  chord_chart_pending: boolean;
  enrichment_started_at?: string | null;
  enrichment_finished_at?: string | null;
  youtube_url: string | null;
  year: number | null;
  year_written: number | null;
  tonality: string | null;
  meter: string | null;
  vibe: string | null;
  altTitles: string[];
  // "Words:" and "Tune:" lines, for a song linked to a text or tune.
  textRef: CreditTextRef;
  tuneRef: CreditTune;
  composers: string[];
  lyricists: string[];
  musicCultures: string[];
  lyricsCultures: string[];
  recordingArtists: RecordingArtist[];
  tagLists: { label: string; tags: { name: string; href: string | null }[] }[];
  personSlugs: Record<string, string>;
  productionSlugs: Record<string, string>;
  productions: string[];
  production_credits?: ProductionCredit[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function openUrl(url: string) {
  Linking.openURL(url).catch(() =>
    Alert.alert('Could not open link', 'Make sure you have a browser installed.')
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <Text className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
      {title}
    </Text>
  );
}

function TagPill({ label, href, onOpen }: { label: string; href?: string | null; onOpen?: (href: string) => void }) {
  if (href && onOpen) {
    return (
      <TouchableOpacity onPress={() => onOpen(href)} className="bg-slate-100 rounded-full px-3 py-1 mr-1.5 mb-1.5">
        <Text className="text-slate-600 text-sm">{label}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <View className="bg-slate-100 rounded-full px-3 py-1 mr-1.5 mb-1.5">
      <Text className="text-slate-600 text-sm">{label}</Text>
    </View>
  );
}

function TagRow({ label, tags, onOpen }: { label: string; tags: (string | { name: string; href: string | null })[]; onOpen?: (href: string) => void }) {
  if (tags.length === 0) return null;
  return (
    <View className="flex-row items-start mb-2">
      <Text className="text-xs font-medium text-slate-500 w-20 shrink-0 mt-1">{label}</Text>
      <View className="flex-1 flex-row flex-wrap">
        {tags.map(t => typeof t === 'string'
          ? <TagPill key={t} label={t} />
          : <TagPill key={t.name} label={t.name} href={t.href} onOpen={onOpen} />)}
      </View>
    </View>
  );
}

function JammerRow({ level, label, jammers, onTap }: {
  level: ConfidenceLevel;
  label: string;
  jammers: SongJammers['lead'];
  onTap: (userId: string) => void;
}) {
  if (jammers.length === 0) return null;
  return (
    <View className="flex-row items-start mb-2">
      <Text className={`text-xs font-medium w-16 shrink-0 mt-1 ${CONFIDENCE_STYLES[level].label}`}>{label}</Text>
      <View className="flex-1 flex-row flex-wrap">
        {jammers.map(j => (
          <TouchableOpacity
            key={j.userId}
            onPress={() => onTap(j.userId)}
            className={`rounded-full px-3 py-1 mr-1.5 mb-1.5 ${CONFIDENCE_STYLES[level].pill}`}
          >
            <Text className={`text-sm font-medium ${CONFIDENCE_STYLES[level].pillText}`}>{j.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function SkeletonBlock({ w, h }: { w: string; h: number }) {
  return <View className={`${w} bg-slate-200 rounded`} style={{ height: h }} />;
}

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] || null;
    if (u.hostname.includes('youtube.com')) {
      return u.searchParams.get('v')
        ?? u.pathname.match(/\/(?:embed|v|shorts)\/([^/?]+)/)?.[1]
        ?? null;
    }
  } catch { /* ignore */ }
  return null;
}

// Web embeds Spotify in an iframe, but on a phone that only ever yields a
// 30-second preview — the full track needs the Spotify app. So both services get
// an open-in-app button here, matching the icon treatment on the song library
// cards. The YouTube player still plays inline; its button is for handing off to
// the app (background audio, casting, saving to a playlist).
function OpenInAppButton({ service, url }: { service: 'youtube' | 'spotify'; url: string }) {
  const youtube = service === 'youtube';
  return (
    <TouchableOpacity
      onPress={() => openUrl(url)}
      className="flex-row items-center gap-1.5 border border-slate-200 rounded-full px-3 py-2"
      accessibilityLabel={youtube ? 'Watch on YouTube' : 'Play on Spotify'}
    >
      {youtube
        ? <Ionicons name="logo-youtube" size={16} color="#ef4444" />
        : <FontAwesome name="spotify" size={16} color="#22c55e" />}
      <Text className="text-slate-600 text-sm font-medium">
        {youtube ? 'YouTube' : 'Spotify'}
      </Text>
      <Ionicons name="open-outline" size={13} color="#94a3b8" />
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SongDetailScreen() {
  const { id: songId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const openBrowse = (href: string) => router.push(href as any);

  const [song, setSong] = useState<SongDetail | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myConfidence, setMyConfidence] = useState<string | null>(null);
  const [melodies, setMelodies] = useState<Melodies | null>(null);
  const melodiesFor = useRef<string | null>(null);
  const [myKey, setMyKey] = useState<string | null>(null);
  const [keyPickerVisible, setKeyPickerVisible] = useState(false);
  const [jammers, setJammers] = useState<SongJammers | null>(null);
  const [popularity, setPopularity] = useState(0);
  const [singingVoice, setSingingVoice] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSongEditor, setIsSongEditor] = useState(false);
  const [myJammerEntry, setMyJammerEntry] = useState<SongJammer | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [addToSetVisible, setAddToSetVisible] = useState(false);


  // The nav bar is empty at rest so the first screenful matches web, then the
  // title fades in once the heading scrolls away. Driven natively off the scroll
  // offset rather than state, so it costs nothing per frame.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [headingBottom, setHeadingBottom] = useState(0);
  const onHeadingLayout = useCallback((e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setHeadingBottom(y + height);
  }, []);
  const headerTitleOpacity = scrollY.interpolate({
    inputRange: [Math.max(headingBottom - 24, 0), Math.max(headingBottom, 1) + 8],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  useEffect(() => {
    if (!songId) return;
    load();
  }, [songId]);

  // A just-added song fills itself in over the next 10–30 seconds (mirrors web):
  // watch its row and reload when the enrichment job finishes or gives up.
  const fillingIn = !!song && enrichmentInProgress(song);
  useEffect(() => {
    if (!song?.id || !fillingIn) return;
    const channel = supabase
      .channel(`song-fill-${song.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'songs', filter: `id=eq.${song.id}` }, (payload: any) => {
        if (payload.new?.enrichment_finished_at) load();
      })
      .subscribe();
    const started = Date.parse(song.enrichment_started_at ?? '');
    const giveUp = setTimeout(load, Math.max(0, started + ENRICHMENT_WAIT_MS - Date.now()) + 500);
    return () => {
      clearTimeout(giveUp);
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song?.id, fillingIn]);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    setMyUserId(user?.id ?? null);
    const forSong = songId;
    melodiesFor.current = forSong;
    supabase.rpc('song_melodies', { p_song_id: forSong }).then(({ data: m }) => {
      if (melodiesFor.current === forSong) setMelodies((m as Melodies | null) ?? NO_MELODIES);
    });

    const [songRes, confidenceRes, profileRes, jammersRes, count] = await Promise.all([
      supabase
        .from('songs')
        .select(`
          id, slug, title, display_artist, byline, first_line, hook, notes,
          genius_url, chord_chart_url, chord_chart_pending, youtube_url,
          year, year_written, tonality, meter, vibe, enrichment_started_at, enrichment_finished_at,
          song_alternate_titles(title),
          song_composers(people(name, slug)),
          song_lyricists(people(name, slug)),
          song_tags(context, tags(name, type, slug)),
          song_recording_artists(year, position, youtube_url, spotify_url, artists(name, slug)),
          song_productions(productions(name, year, slug)),
          texts(slug, year, year_precision, songs(count), text_sources(corpus, book, chapter_start, verse_start, chapter_end, verse_end, citation, relation)),
          tunes(name, slug, year, year_precision)
        `)
        .eq('id', songId)
        .single(),
      user
        ? supabase.from('user_songs').select('confidence, key_note')
            .eq('user_id', user.id).eq('song_id', songId).maybeSingle()
        : Promise.resolve({ data: null }),
      user
        ? supabase.from('profiles')
            .select('role, singing_voice, display_name, last_name, username')
            .eq('id', user.id).single()
        : Promise.resolve({ data: null }),
      user ? fetchSongJammers(supabase, songId) : Promise.resolve(null),
      // The count comes from the web API because it reads through the service
      // role there — RLS would otherwise hide other people's rows and undercount.
      // The route is unauthenticated, so guests get the real number too.
      fetch(`${WEB_URL}/api/songs/${songId}/count`)
        .then(r => r.json())
        .then(j => Number(j.count ?? 0))
        .catch(() => 0),
    ]);

    if (!songRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    const s = songRes.data as any;
    const tagRows: SongTagRow[] = s.song_tags ?? [];
    // Where "Traditional" comes from: the melody's / words' own tradition when
    // set, otherwise the song's general cultures and communities (as on web).
    const origins = (context: TagContext) => [...songTagNames(tagRows, 'culture', context), ...songTagNames(tagRows, 'community', context)];

    setSong({
      id: s.id,
      slug: s.slug ?? null,
      title: s.title ?? '',
      display_artist: s.display_artist ?? null,
      byline: s.byline ?? s.display_artist ?? null,
      first_line: s.first_line ?? null,
      hook: s.hook ?? null,
      notes: s.notes ?? null,
      genius_url: s.genius_url ?? null,
      chord_chart_url: s.chord_chart_url ?? null,
      chord_chart_pending: !!s.chord_chart_pending,
      enrichment_started_at: s.enrichment_started_at ?? null,
      enrichment_finished_at: s.enrichment_finished_at ?? null,
      youtube_url: s.youtube_url ?? null,
      year: s.year ?? null,
      year_written: s.year_written ?? null,
      tonality: s.tonality ?? null,
      meter: s.meter ?? null,
      vibe: s.vibe ?? null,
      altTitles: (s.song_alternate_titles ?? []).map((x: any) => x.title).filter(Boolean),
      textRef: s.texts ?? null,
      tuneRef: s.tunes ?? null,
      composers: sortByLastName((s.song_composers ?? []).map((x: any) => x.people?.name).filter(Boolean)),
      lyricists: sortByLastName((s.song_lyricists ?? []).map((x: any) => x.people?.name).filter(Boolean)),
      musicCultures: origins('music').length ? origins('music') : origins('general'),
      lyricsCultures: origins('lyrics').length ? origins('lyrics') : origins('general'),
      recordingArtists: sortRecordingsByYear(
        (s.song_recording_artists ?? [])
          .map((x: any) => ({ name: x.artists?.name, slug: x.artists?.slug ?? null, year: x.year, position: x.position, youtube_url: x.youtube_url, spotify_url: x.spotify_url }))
          .filter((x: any) => x.name)
      ),
      tagLists: (['genre', 'form', 'occasion', 'community', 'theme', 'language', 'culture'] as const)
        .map((type) => ({
          label: TAG_TYPE_LABELS[type],
          tags: songTagRefs(tagRows, type).map((t) => ({ name: t.name, href: t.slug ? nativeBrowseHref(browsePath(type, t.slug)) : null })),
        }))
        .filter((t) => t.tags.length > 0),
      personSlugs: Object.fromEntries(
        [...(s.song_composers ?? []), ...(s.song_lyricists ?? [])].filter((x: any) => x.people?.slug).map((x: any) => [x.people.name, x.people.slug])
      ),
      productionSlugs: Object.fromEntries((s.song_productions ?? []).filter((x: any) => x.productions?.slug).map((x: any) => [x.productions.name, x.productions.slug])),
      productions: (s.song_productions ?? []).map((x: any) => x.productions?.name).filter(Boolean),
      production_credits: (s.song_productions ?? [])
        .map((x: any) => x.productions)
        .filter((p: any) => p?.name)
        .map((p: any) => ({ name: p.name, year: p.year ?? null })),
    });

    setMyConfidence((confidenceRes.data as any)?.confidence ?? null);
    setMyKey((confidenceRes.data as any)?.key_note ?? null);
    const p = profileRes.data as any;
    setSingingVoice(p?.singing_voice ?? null);
    setIsAdmin(p?.role === 'admin');
    setIsSongEditor(p?.role === 'song_editor');
    if (user && p) {
      setMyJammerEntry({
        userId: user.id,
        name: [p.display_name, p.last_name].filter(Boolean).join(' ') || 'Unknown',
        username: p.username ?? '',
      });
    }
    setPopularity(count);
    if (jammersRes) setJammers(jammersRes);

    setLoading(false);
  }

  // Paint the new role straight away and roll back if the write fails, the way
  // the repertoire tab and song library already do — waiting on the round-trip
  // put a visible lag on every tap. Web moves the viewer between the Jammers
  // rows on the same tick, so this does too.
  function applyConfidence(next: string | null, write: () => PromiseLike<{ error: any }>) {
    const previousConfidence = myConfidence;
    const previousJammers = jammers;

    setMyConfidence(next);
    if (myJammerEntry) {
      setJammers(prev => {
        if (!prev) return prev;
        const without = (arr: SongJammer[]) => arr.filter(j => j.userId !== myJammerEntry.userId);
        const updated: SongJammers = { lead: without(prev.lead), support: without(prev.support), learn: without(prev.learn) };
        if (next === 'lead' || next === 'support' || next === 'learn') {
          updated[next] = [...updated[next], myJammerEntry];
        }
        return updated;
      });
    }
    if (next && !previousConfidence) setPopularity(n => n + 1);
    if (!next && previousConfidence) setPopularity(n => Math.max(n - 1, 0));

    write().then(({ error }) => {
      if (!error) return;
      Alert.alert('Error', error.message);
      setMyConfidence(previousConfidence);
      setJammers(previousJammers);
      setPopularity(n => (next && !previousConfidence ? Math.max(n - 1, 0) : !next && previousConfidence ? n + 1 : n));
    });
  }

  async function addToRepertoire(confidence: string) {
    if (!song || !myUserId) return;
    if (!(await ensureLeadVoice(confidence, singingVoice, myUserId, setSingingVoice))) return;
    const songId = song.id;
    const uid = myUserId;
    applyConfidence(confidence, () =>
      supabase.from('user_songs').upsert(
        { user_id: uid, song_id: songId, confidence, updated_at: new Date().toISOString() },
        { onConflict: 'user_id,song_id' }
      )
    );
  }

  // "I know this song!" asks lead or support; learning has its own link, as on web.
  async function handleAddToRepertoire(event: GestureResponderEvent) {
    if (!song) return;
    if (!myUserId) { router.push('/(auth)/sign-in' as any); return; }
    showOptionsSheet({
      title: `Add "${song.title}" as…`,
      anchor: anchorFrom(event),
      options: [
        { label: 'Lead', onPress: () => addToRepertoire('lead') },
        { label: 'Support', onPress: () => addToRepertoire('support') },
      ],
    });
  }

  function handleWantToLearn() {
    if (!myUserId) { router.push('/(auth)/sign-in' as any); return; }
    addToRepertoire('learn');
  }

  // Removing is rare, so like web it lives only at the foot of the page. The key
  // goes with the user_songs row; migration 179's trigger deletes the notes.
  function handleRemoveFromRepertoire() {
    if (!myUserId || !song) return;
    const songId = song.id;
    const uid = myUserId;

    Alert.alert('Remove from repertoire', `Remove "${song.title}" from your repertoire? Your key and notes for it will be deleted.`, [
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          setMyKey(null);
          applyConfidence(null, () =>
            supabase.from('user_songs').delete().eq('user_id', uid).eq('song_id', songId)
          );
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleChangeConfidence(event: GestureResponderEvent) {
    if (!myUserId || !song) return;
    const songId = song.id;
    const uid = myUserId;

    const update = async (confidence: string) => {
      if (!(await ensureLeadVoice(confidence, singingVoice, uid, setSingingVoice))) return;
      applyConfidence(confidence, () =>
        supabase.from('user_songs')
          .update({ confidence, updated_at: new Date().toISOString() })
          .eq('user_id', uid).eq('song_id', songId)
      );
    };

    showOptionsSheet({
      title: song.title,
      anchor: anchorFrom(event),
      options: [
        { label: 'Lead', onPress: () => update('lead') },
        { label: 'Support', onPress: () => update('support') },
        { label: 'Learn', onPress: () => update('learn') },
      ],
    });
  }

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerTintColor: '#d97706' }} />
        <ScrollView className="flex-1 bg-white" contentContainerStyle={{ padding: 16, gap: 12 }}>
          <SkeletonBlock w="w-2/3" h={28} />
          <SkeletonBlock w="w-1/3" h={18} />
          <View style={{ height: 8 }} />
          <SkeletonBlock w="w-full" h={16} />
          <SkeletonBlock w="w-3/4" h={16} />
          <SkeletonBlock w="w-1/2" h={16} />
        </ScrollView>
      </>
    );
  }

  if (notFound || !song) {
    return (
      <>
        <Stack.Screen options={{ title: 'Song', headerTintColor: '#d97706' }} />
        <View className="flex-1 bg-white items-center justify-center">
          <Text className="text-slate-400">Song not found</Text>
        </View>
      </>
    );
  }


  const tonalityPills = song.tonality ? song.tonality.split(',').map(s => s.trim()).filter(Boolean) : [];
  const meterPills = song.meter ? song.meter.split(',').map(s => s.trim()).filter(Boolean) : [];

  // Build per-artist media entries for the recordings section
  type MediaEntry = { label: string; youtubeId: string | null; spotifyUrl: string | null };
  const mediaEntries: MediaEntry[] = song.recordingArtists
    .filter(ra => ra.youtube_url || ra.spotify_url)
    .map(ra => ({
      label: `${ra.name}${ra.year ? ` (${ra.year})` : ''}`,
      youtubeId: extractYouTubeId(ra.youtube_url),
      spotifyUrl: ra.spotify_url ?? null,
    }));
  if (mediaEntries.length === 0 && song.youtube_url) {
    mediaEntries.push({ label: song.display_artist ?? song.title, youtubeId: extractYouTubeId(song.youtube_url), spotifyUrl: null });
  }
  const hasMedia = mediaEntries.length > 0;
  // Web only names the artist when there is more than one recording to tell apart.
  const showMediaLabels = mediaEntries.length > 1;

  const allYears = [song.year_written, song.year, ...song.recordingArtists.map(ra => ra.year)]
    .filter((y): y is number => !!y);
  const earliestYear = allYears.length > 0 ? Math.min(...allYears) : null;

  const creditLines = songCreditLines({
    composers: song.composers.map((name) => ({ name, slug: song.personSlugs[name] ?? null })),
    lyricists: song.lyricists.map((name) => ({ name, slug: song.personSlugs[name] ?? null })),
    musicCultures: song.musicCultures, lyricsCultures: song.lyricsCultures,
    text: song.textRef, tune: song.tuneRef,
  });
  const hasMusicalProps = tonalityPills.length > 0 || meterPills.length > 0 || !!song.vibe;
  const hasTags = song.tagLists.length > 0;
  const hasJammers = jammers && (jammers.lead.length > 0 || jammers.support.length > 0 || jammers.learn.length > 0);

  // Web repeats this control group at the top and bottom of the page, so a long
  // song doesn't force a scroll back up to change your role.
  async function handleKeyChange(next: string | null) {
    if (!myUserId) return;
    const prev = myKey;
    setMyKey(next);
    const { error } = await supabase.from('user_songs').update({ key_note: next }).eq('user_id', myUserId).eq('song_id', songId);
    if (error) { setMyKey(prev); Alert.alert('Error', error.message); }
  }

  function renderRepertoireControls() {
    return (
      <View className="flex-row flex-wrap items-center gap-2 mt-4">
        {myConfidence ? (
          <>
            <RolePill level={myConfidence} onPress={handleChangeConfidence} size="md" />
            <MyKeyChip value={myKey} onPress={() => setKeyPickerVisible(true)} size="md" />
            <TouchableOpacity
              onPress={() => setAddToSetVisible(true)}
              className="flex-row items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5"
            >
              <Ionicons name="list-outline" size={14} color="#64748b" />
              <Text className="text-slate-600 text-sm">Add to set</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            {(() => {
              const known = knownTuneHint(melodies, myConfidence);
              return known ? (
                <View className="w-full flex-row flex-wrap items-center gap-2 mb-1">
                  <Text className="text-sm text-slate-600">
                    You know the tune from <Text className="font-medium">{known.title}</Text>
                  </Text>
                  <TouchableOpacity
                    onPress={() => myUserId ? addToRepertoire('lead') : router.push('/(auth)/sign-in' as any)}
                    className="rounded-full bg-amber-100 px-3 py-1"
                  >
                    <Text className="text-sm font-medium text-amber-800">Add as Lead</Text>
                  </TouchableOpacity>
                </View>
              ) : null;
            })()}
            <TouchableOpacity
              onPress={handleAddToRepertoire}
              className="rounded-full border border-indigo-500 bg-indigo-500 px-4 py-1.5"
            >
              <Text className="text-white text-sm font-medium">I know this song!</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleWantToLearn} className="rounded-full border border-indigo-200 bg-white px-4 py-1.5">
              <Text className="text-indigo-600 text-sm font-medium">Want to learn it</Text>
            </TouchableOpacity>
          </>
        )}
        {isAdmin || isSongEditor ? (
          // The song editor is web-only, so editors hand off to the browser.
          <TouchableOpacity
            onPress={() => openUrl(`${WEB_URL}/${isAdmin ? 'admin' : 'song-editor'}/songs/${song!.slug ?? song!.id}`)}
            className="flex-row items-center gap-1 rounded-full border border-slate-300 bg-white px-3 py-1.5"
          >
            <Text className="text-slate-600 text-sm">Edit</Text>
            <Ionicons name="open-outline" size={13} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          headerTintColor: '#d97706',
          headerTitle: () => (
            <Animated.Text
              numberOfLines={1}
              style={{ opacity: headerTitleOpacity, fontSize: 17, fontWeight: '600', color: '#0f172a' }}
            >
              {song.title}
            </Animated.Text>
          ),
        }}
      />

      {song && (
        <AddToSetModal
          visible={addToSetVisible}
          songs={[{ id: song.id, title: song.title }]}
          onClose={() => setAddToSetVisible(false)}
        />
      )}

      <ContentContainer style={{ backgroundColor: 'white' }}>
      <Animated.ScrollView
        // Plain style rather than className: this is the app's only Animated
        // component, and NativeWind's className handling for it is unproven.
        style={{ flex: 1, backgroundColor: 'white' }}
        contentContainerStyle={{ paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
      >

        {/* Title + meta */}
        <View className="px-4 pt-5 pb-4 border-b border-slate-100">
          <View className="flex-row items-start justify-between gap-4" onLayout={onHeadingLayout}>
            <Text className="flex-1 text-2xl font-bold text-slate-900">{song.title}</Text>
            <View className="shrink-0 flex-row items-center gap-3 mt-1">
              {popularity > 0 ? (
                <Text className="text-sm text-slate-400">
                  {formatJammers(popularity)}
                </Text>
              ) : null}
              {earliestYear ? (
                <Text className="text-sm text-slate-400">{earliestYear}</Text>
              ) : null}
            </View>
          </View>

          {song.productions.length > 0 ? (
            <Text className="text-base text-slate-500 mt-0.5">
              from{' '}
              {productionCredits(song.production_credits, song.productions).map((p, i) => (
                <Text key={`${p.name}-${p.year}`}>
                  {i > 0 ? ', ' : null}
                  <Text onPress={song.productionSlugs[p.name] ? () => openBrowse(nativeBrowseHref(browsePath('show', song.productionSlugs[p.name]))) : undefined}>
                    <Text className="italic">{p.name}</Text>
                    {p.year ? ` (${p.year})` : null}
                  </Text>
                </Text>
              ))}
            </Text>
          ) : song.byline ? (
            <Text className="text-base text-slate-500 mt-0.5">
              <CreditText
                separator=""
                credits={bylineCredits(song.byline, { people: [...song.composers, ...song.lyricists], artists: song.recordingArtists.map((a) => a.name) })}
                onOpen={(path) => openBrowse(nativeBrowseHref(path))}
                linkClassName="text-amber-700"
              />
            </Text>
          ) : null}

          {song.altTitles.length > 0 ? (
            <Text className="text-sm text-slate-400 mt-1">aka: {song.altTitles.join(' · ')}</Text>
          ) : null}
          {renderRepertoireControls()}

          {song.chord_chart_url || song.genius_url ? (
            <View className="flex-row flex-wrap gap-2 mt-3">
              {song.chord_chart_url ? (
                <TouchableOpacity
                  onPress={() => openUrl(song.chord_chart_url!)}
                  className="flex-row items-center gap-1 border border-slate-200 rounded-full px-4 py-2"
                >
                  <Text className="text-slate-600 text-sm font-medium">Chords</Text>
                  <Ionicons name="open-outline" size={13} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
              {song.genius_url ? (
                <TouchableOpacity
                  onPress={() => openUrl(song.genius_url!)}
                  className="flex-row items-center gap-1 border border-slate-200 rounded-full px-4 py-2"
                >
                  <Text className="text-slate-600 text-sm font-medium">Lyrics</Text>
                  <Ionicons name="open-outline" size={13} color="#94a3b8" />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
          {fillingIn ? (
            <View className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-4">
              <Text className="text-sm text-zinc-600">Finding the songwriters, key, lyrics and tags…</Text>
              {['w-1/2', 'w-1/3', 'w-2/3'].map(w => (
                <View key={w} className="mt-2 flex-row items-center gap-3">
                  <View className="h-3 w-20 rounded bg-zinc-200" />
                  <View className={`h-3 ${w} rounded bg-zinc-100`} />
                </View>
              ))}
            </View>
          ) : null}
          <ChordChartControls
            songId={song.id}
            url={song.chord_chart_url}
            pending={song.chord_chart_pending}
            signedIn={!!myUserId}
            onChanged={({ url, pending }) => setSong((prev) => (prev ? { ...prev, chord_chart_url: url, chord_chart_pending: pending } : prev))}
          />
          {myConfidence && myUserId ? <MySongNotes songId={song.id} userId={myUserId} className="mt-3" /> : null}
          {song.chord_chart_url ? <UgBackTip className="mt-3" /> : null}
        </View>

        {/* Songwriters */}
        {creditLines.length > 0 ? (
          <View className="px-4 py-4 border-b border-slate-100">
            <SectionHeader title="Songwriters" />
            {creditLines.map((line) => (
              <Text key={line.label} className="text-sm text-slate-700 mb-1">
                <Text className="font-medium">{line.label}: </Text>
                {line.groups.map((g, i) => (
                  <Text key={i}>
                    {i > 0 ? ' · ' : null}
                    <CreditText credits={g} onOpen={(path) => openBrowse(nativeBrowseHref(path))} linkClassName="text-amber-700" />
                  </Text>
                ))}
              </Text>
            ))}
          </View>
        ) : null}

        <KeyPicker
          visible={keyPickerVisible}
          title="My key"
          current={myKey}
          onClose={() => setKeyPickerVisible(false)}
          onSelect={handleKeyChange}
        />

        {/* Recordings — web groups the written year in here rather than the header */}
        {(song.recordingArtists.length > 0 || song.year_written) ? (
          <View className="px-4 py-4 border-b border-slate-100">
            {song.year_written ? (
              <Text className="text-sm text-slate-600 mb-3">
                <Text className="font-medium text-slate-700">Written: </Text>
                {song.year_written}
              </Text>
            ) : null}
            {song.recordingArtists.length > 0 ? (
              <>
                <SectionHeader title="Recordings" />
                <View className="flex-row flex-wrap">
                  {song.recordingArtists.map((ra, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => openBrowse(nativeBrowseHref(browsePath('artist', ra.slug ?? ra.name)))}
                      className="bg-slate-100 rounded-full px-3 py-1 mr-1.5 mb-1.5 flex-row items-center gap-1.5"
                    >
                      <Text className="text-slate-700 text-sm">{ra.name}</Text>
                      {ra.year ? <Text className="text-slate-400 text-sm">{ra.year}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}
          </View>
        ) : null}

        <SongMelodies title="Other tunes" items={melodies?.other_melodies ?? []} onOpen={(id) => router.push(`/song/${id}` as any)} />
        <SongMelodies title="Also sung to this tune" items={melodies?.same_tune ?? []} onOpen={(id) => router.push(`/song/${id}` as any)} />

        {/* Media — inline YouTube player plus hand-off buttons for both apps */}
        {hasMedia ? (
          <View className="px-4 py-4 border-b border-slate-100">
            <SectionHeader title="Listen / Watch" />
            {mediaEntries.map((entry, i) => (
              <View key={i} className={i > 0 ? 'mt-4' : undefined}>
                {showMediaLabels ? (
                  <Text className="text-sm font-medium text-slate-500 mb-2">{entry.label}</Text>
                ) : null}
                {entry.youtubeId ? <YouTubePlayer videoId={entry.youtubeId} /> : null}
                <View className="flex-row flex-wrap gap-2">
                  {entry.youtubeId ? (
                    <OpenInAppButton
                      service="youtube"
                      url={`https://www.youtube.com/watch?v=${entry.youtubeId}`}
                    />
                  ) : null}
                  {entry.spotifyUrl ? (
                    <OpenInAppButton service="spotify" url={entry.spotifyUrl} />
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {/* Lyrics card */}
        {(song.first_line || song.hook) ? (
          <View className="px-4 py-4 border-b border-slate-100">
            <SectionHeader title="Lyrics" />
            {song.first_line ? (
              <Text className="text-sm text-slate-700 mb-1">
                <Text className="font-medium text-slate-500">Opens: </Text>
                <Text className="italic">{song.first_line}</Text>
              </Text>
            ) : null}
            {song.hook ? (
              <Text className="text-sm text-slate-700">
                <Text className="font-medium text-slate-500">Hook: </Text>
                <Text className="italic">{song.hook}</Text>
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Musical properties */}
        {hasMusicalProps ? (
          <View className="px-4 py-4 border-b border-slate-100">
            <SectionHeader title="Musical properties" />
            <TagRow label="Tonality" tags={tonalityPills} />
            <TagRow label="Meter" tags={meterPills} />
            {song.vibe ? <TagRow label="Vibe" tags={[song.vibe]} /> : null}
          </View>
        ) : null}

        {/* Tags */}
        {hasTags ? (
          <View className="px-4 py-4 border-b border-slate-100">
            <SectionHeader title="Tags" />
            {song.tagLists.map((t) => <TagRow key={t.label} label={t.label} tags={t.tags} onOpen={openBrowse} />)}
          </View>
        ) : null}

        {/* Notes */}
        {song.notes ? (
          <View className="px-4 py-4 border-b border-slate-100">
            <SectionHeader title="Notes" />
            <Text className="text-sm text-slate-700 leading-relaxed">{song.notes}</Text>
          </View>
        ) : null}

        {/* Jammers */}
        {myUserId ? (
          <View className="px-4 py-4">
            <SectionHeader title="Jammers" />
            {!jammers ? (
              <ActivityIndicator size="small" color="#d97706" />
            ) : hasJammers ? (
              <>
                <JammerRow
                  level="lead"
                  label="Lead"
                  jammers={jammers.lead}
                  onTap={(userId) => router.push(`/profile/${userId}` as any)}
                />
                <JammerRow
                  level="support"
                  label="Support"
                  jammers={jammers.support}
                  onTap={(userId) => router.push(`/profile/${userId}` as any)}
                />
                <JammerRow
                  level="learn"
                  label="Learning"
                  jammers={jammers.learn}
                  onTap={(userId) => router.push(`/profile/${userId}` as any)}
                />
              </>
            ) : (
              <Text className="text-sm text-slate-400">No jammers have added this song yet.</Text>
            )}
          </View>
        ) : (
          <View className="py-4">
            <PromptCard
              variant="guest"
              title={popularity > 0
                ? `${popularity} ${popularity === 1 ? 'jammer knows' : 'jammers know'} this song`
                : 'Find jammers who know this song'}
              body={popularity > 0
                ? 'Sign up to see who — and find your next jam.'
                : 'Sign up and be the first to add it.'}
              actionLabel="Sign in →"
              onAction={() => router.push('/(auth)/sign-in' as any)}
            />
          </View>
        )}

        {/* Bottom action bar — mirrors web's repeat of the controls plus a way back */}
        <View className="px-4 pt-2">
          {renderRepertoireControls()}
          <TouchableOpacity
            onPress={() => router.replace((myConfidence ? '/(tabs)' : '/songs') as any)}
            className="mt-4"
          >
            <Text className="text-sm text-amber-600">
              {myConfidence ? '← Back to repertoire' : '← Back to search'}
            </Text>
          </TouchableOpacity>
          {myConfidence ? (
            <View className="mt-6 pt-4 pb-6 border-t border-slate-100">
              <TouchableOpacity
                onPress={handleRemoveFromRepertoire}
                className="self-start rounded-full border border-slate-200 bg-white px-2.5 py-1.5"
              >
                <Text className="text-xs text-slate-400">Remove from my repertoire</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>

      </Animated.ScrollView>
      </ContentContainer>
    </>
  );
}
