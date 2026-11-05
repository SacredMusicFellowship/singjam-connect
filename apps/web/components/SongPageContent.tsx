"use client";

import { CONFIDENCE_STYLES, type ConfidenceLevel } from "@singjam/core";
import { Fragment, useEffect, useRef, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { formatComposersLong, sortByLastName, setsAcceptingSongs } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";
import RepertoireButton from "@/components/RepertoireButton";
import MySongNotes from "@/components/MySongNotes";
import MyKeySelect from "@/components/MyKeySelect";
import UgBackTip from "@/components/UgBackTip";
import AddToSetPanel from "@/components/AddToSetPanel";
import ChordChartSlot from "@/components/ChordChartSlot";

function TagRow({ label, tags }: { label: string; tags: string[] }) {
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className="text-xs font-medium text-slate-500 w-20 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-600">
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

function JammerRow({ level, label, jammers }: { level: ConfidenceLevel; label: string; jammers: { name: string; username: string }[] }) {
  const style = CONFIDENCE_STYLES[level];
  return (
    <div className="flex flex-wrap items-baseline gap-2">
      <span className={`text-xs font-medium w-16 shrink-0 ${style.label}`}>{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {jammers.map((j, i) => (
          <Link key={i} href={`/u/${j.username}`}
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80 ${style.pill} ${style.pillText}`}>
            {j.name}
          </Link>
        ))}
      </div>
    </div>
  );
}

type SongData = {
  song: any;
  isAdmin: boolean;
  isSongEditor: boolean;
  isLoggedIn: boolean;
  singingVoice: string | null;
  userSongConfidence: string | null;
  popularity: number;
};

type JammerEntry = { name: string; username: string };
type SongUsers = {
  lead: JammerEntry[];
  support: JammerEntry[];
  learn: JammerEntry[];
};

// Some browsers (Chrome iOS) re-apply a stale scroll offset after the
// client-fetched content lands, so the page opens scrolled down. They ignore
// the Blink-only overflow-anchor fix in the root layout, so after the content
// mounts we briefly pin the viewport to the top — unless the user has already
// scrolled on purpose, or arrived via back/forward (where the browser is
// legitimately restoring their old position).
let lastPopstate = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => { lastPopstate = Date.now(); });
}

function usePinToTopOnLoad(loaded: boolean) {
  const userScrolledRef = useRef(false);

  useEffect(() => {
    const mark = () => { userScrolledRef.current = true; };
    window.addEventListener("touchstart", mark, { passive: true });
    window.addEventListener("wheel", mark, { passive: true });
    window.addEventListener("keydown", mark);
    return () => {
      window.removeEventListener("touchstart", mark);
      window.removeEventListener("wheel", mark);
      window.removeEventListener("keydown", mark);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (Date.now() - lastPopstate < 3000) return;
    const start = performance.now();
    let raf = requestAnimationFrame(function pin() {
      if (userScrolledRef.current) return;
      if (window.scrollY > 0) window.scrollTo(0, 0);
      if (performance.now() - start < 800) raf = requestAnimationFrame(pin);
    });
    return () => cancelAnimationFrame(raf);
  }, [loaded]);
}

export default function SongPageContent() {
  const params = useParams();
  const slug = params.slug as string;
  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<SongData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [myKey, setMyKey] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [songUsers, setSongUsers] = useState<SongUsers | null>(null);
  const [songUsersLoading, setSongUsersLoading] = useState(false);
  const [currentUserEntry, setCurrentUserEntry] = useState<JammerEntry | null>(null);
  const [userSets, setUserSets] = useState<{ id: string; name: string }[] | null>(null);
  const [songInSets, setSongInSets] = useState<Set<string>>(new Set());
  const supabase = supabaseBrowser();

  usePinToTopOnLoad(data !== null);

  useEffect(() => {
    (async () => {
      setData(null);
      setSongUsers(null);
      setSongUsersLoading(false);
      setNotFound(false);

      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

      const songQuery = supabase.from("songs").select(`
          id, title, slug, display_artist, first_line, hook, notes, genius_url, chord_chart_url, youtube_url, year, year_written, tonality, meter, vibe,
          song_composers(people(name)),
          song_lyricists(people(name)),
          song_recording_artists(year, position, youtube_url, spotify_url, artists(name)),
          song_alternate_titles(title),
          song_genres(genres(name)),
          song_themes(themes(name)),
          song_cultures(context, cultures(name)),
          song_languages(languages(name)),
          song_productions(productions(name, year))
        `);
      const [{ data: { user } }, songRes] = await Promise.all([
        supabase.auth.getUser(),
        (isUuid ? songQuery.eq("id", slug) : songQuery.or(`slug.eq.${slug},former_slug.eq.${slug}`)).single(),
      ]);

      if (!songRes.data) { setNotFound(true); return; }

      if (!isUuid && songRes.data.slug !== slug) {
        router.replace(`/songs/${songRes.data.slug}`);
      }

      const song = songRes.data;

      const [profileRes, userSongRes, popularityJson] = await Promise.all([
        user
          ? supabase.from("profiles").select("role, singing_voice, display_name, last_name, username").eq("id", user.id).single()
          : Promise.resolve({ data: null }),
        user
          ? supabase.from("user_songs").select("confidence, key_note").eq("user_id", user.id).eq("song_id", song.id).maybeSingle()
          : Promise.resolve({ data: null }),
        fetch(`/api/songs/${song.id}/count`).then((r) => r.json()),
      ]);

      const loadedConfidence = (userSongRes.data as any)?.confidence ?? null;
      const isAdmin = (profileRes.data as any)?.role === "admin";
      const isSongEditor = (profileRes.data as any)?.role === "song_editor";
      const isLoggedIn = user !== null;
      if (profileRes.data) {
        const p = profileRes.data as any;
        setCurrentUserEntry({
          name: [p.display_name, p.last_name].filter(Boolean).join(" ") || "Unknown",
          username: p.username ?? "",
        });
      }
      setConfidence(loadedConfidence);
      setMyKey((userSongRes.data as any)?.key_note ?? null);
      setUserId(user?.id ?? null);
      setData({
        song,
        isAdmin,
        isSongEditor,
        isLoggedIn,
        singingVoice: (profileRes.data as any)?.singing_voice ?? null,
        userSongConfidence: loadedConfidence,
        popularity: popularityJson.count ?? 0,
      });

      if (isLoggedIn) {
        setSongUsersLoading(true);
        try {
          const res = await fetch(`/api/songs/${song.id}/users`);
          setSongUsers(await res.json());
        } finally {
          setSongUsersLoading(false);
        }
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Deleting the user_songs row takes the key with it; migration 179's trigger
  // deletes the private notes.
  async function handleRemoveFromRepertoire() {
    if (!userId || !data) return;
    setRemoving(true);
    const { error } = await supabase.from("user_songs").delete().eq("user_id", userId).eq("song_id", data.song.id);
    setRemoving(false);
    if (error) { alert(error.message); return; }
    setConfirmingRemove(false);
    setMyKey(null);
    handleConfidenceChange(null);
    router.refresh();
  }

  async function handleKeyChange(next: string | null) {
    if (!userId || !data) return;
    const prev = myKey;
    setMyKey(next);
    const { error } = await supabase.from("user_songs").update({ key_note: next }).eq("user_id", userId).eq("song_id", data.song.id);
    if (error) { setMyKey(prev); alert(error.message); }
  }

  function handleConfidenceChange(level: string | null) {
    setConfidence(level);
    if (!currentUserEntry) return;
    setSongUsers((prev) => {
      if (!prev) return prev;
      const without = (arr: JammerEntry[]) => arr.filter((j) => j.username !== currentUserEntry.username);
      const updated = { lead: without(prev.lead), support: without(prev.support), learn: without(prev.learn) };
      if (level === "lead" || level === "support" || level === "learn") {
        updated[level] = [...updated[level], currentUserEntry];
      }
      return updated;
    });
  }

  async function loadSetData() {
    const songId = data?.song?.id;
    const [setsJson, membership] = await Promise.all([
      userSets === null
        ? fetch("/api/sets").then((r) => (r.ok ? r.json() : { owned: [], collaborating: [] }))
        : null,
      songId ? supabase.from("set_songs").select("set_id").eq("song_id", songId) : null,
    ]);
    if (setsJson) setUserSets(setsAcceptingSongs([...(setsJson.owned ?? []), ...(setsJson.collaborating ?? [])]));
    if (membership?.data) setSongInSets(new Set(membership.data.map((r: any) => r.set_id)));
  }

  if (notFound) return <p className="text-sm text-slate-500">Song not found.</p>;
  if (!data) {
    return (
      <div className="min-h-screen space-y-6">
        <div className="space-y-2">
          <div className="h-7 w-2/3 animate-pulse rounded bg-zinc-200" />
          <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-baseline gap-4">
              <div className="h-3 w-20 shrink-0 animate-pulse rounded bg-zinc-200" />
              <div className="flex flex-wrap gap-1.5">
                <div className="h-5 w-16 animate-pulse rounded-full bg-zinc-100" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-zinc-100" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-10 w-32 animate-pulse rounded-xl bg-zinc-100" />
      </div>
    );
  }

  const { song, isAdmin, isSongEditor, isLoggedIn, singingVoice, userSongConfidence, popularity } = data;

  const composers = sortByLastName((song.song_composers as any[]).map((x: any) => x.people?.name).filter(Boolean));
  const lyricists = sortByLastName((song.song_lyricists as any[]).map((x: any) => x.people?.name).filter(Boolean));
  const cultureRows = song.song_cultures as any[];
  const musicSpecificRows = cultureRows.filter((x: any) => x.context === "music");
  const lyricsSpecificRows = cultureRows.filter((x: any) => x.context === "lyrics");
  const noContextRows = cultureRows.filter((x: any) => !x.context);
  const musicCultures = (musicSpecificRows.length ? musicSpecificRows : noContextRows)
    .map((x: any) => x.cultures?.name).filter(Boolean) as string[];
  const lyricsCultures = (lyricsSpecificRows.length ? lyricsSpecificRows : noContextRows)
    .map((x: any) => x.cultures?.name).filter(Boolean) as string[];
  const recordingArtists = (song.song_recording_artists as any[])
    .map((x: any) => ({ name: x.artists?.name as string, year: x.year as number | null, position: x.position as number | null, youtube_url: x.youtube_url as string | null, spotify_url: x.spotify_url as string | null }))
    .filter((x: any) => x.name)
    .sort((a: any, b: any) => (a.position ?? 999) - (b.position ?? 999));
  const altTitles = (song.song_alternate_titles as any[]).map((x: any) => x.title as string).filter(Boolean);
  const genres = (song.song_genres as any[]).map((x: any) => x.genres?.name as string).filter(Boolean).sort();
  const themes = (song.song_themes as any[]).map((x: any) => x.themes?.name as string).filter(Boolean).sort();
  const cultures = [...new Set((song.song_cultures as any[]).map((x: any) => x.cultures?.name as string).filter(Boolean))];
  const languages = (song.song_languages as any[]).map((x: any) => x.languages?.name as string).filter(Boolean);
  const songProductions = (song.song_productions as any[])
    .map((x: any) => x.productions)
    .filter((p: any): p is { name: string; year: number | null } => !!p?.name);
  const allYears = [song.year_written, song.year, ...recordingArtists.map((a: any) => a.year)].filter(Boolean) as number[];
  const earliestYear = allYears.length > 0 ? Math.min(...allYears) : null;
  const tonalityPills = song.tonality ? song.tonality.split(",").map((s: string) => s.trim()).filter(Boolean) : [];
  const meterPills = song.meter ? song.meter.split(",").map((s: string) => s.trim()).filter(Boolean) : [];

  function handleChartAdded(url: string) {
    setData((prev) => (prev ? { ...prev, song: { ...prev.song, chord_chart_url: url } } : prev));
  }

  return (
    <div className="space-y-6 pb-16">
      <div>
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-bold text-slate-900">{song.title}</h1>
              {(isAdmin || isSongEditor) && (
                <Link
                  href={`${isAdmin ? "/admin/songs" : "/song-editor/songs"}/${song.slug ?? song.id}`}
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Edit
                </Link>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {popularity > 0 && (
                <span className="text-sm text-slate-400">{popularity} {popularity === 1 ? "jammer" : "jammers"}</span>
              )}
              {earliestYear && (
                <span className="text-sm text-slate-400">{earliestYear}</span>
              )}
            </div>
          </div>
          {songProductions.length > 0 ? (
            <p className="mt-0.5 text-base text-slate-500">
              from{" "}
              {songProductions.map((p, i) => (
                <Fragment key={`${p.name}-${p.year}`}>
                  {i > 0 && ", "}
                  <em>{p.name}</em>
                  {p.year ? ` (${p.year})` : null}
                </Fragment>
              ))}
            </p>
          ) : song.display_artist ? (
            <p className="mt-0.5 text-base text-slate-500">{song.display_artist}</p>
          ) : null}
          {altTitles.length > 0 && (
            <p className="mt-1 text-sm text-slate-400">aka: {altTitles.join(" · ")}</p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <RepertoireButton songId={song.id} initialConfidence={confidence} singingVoice={singingVoice} onConfidenceChange={handleConfidenceChange}>
              {confidence && <MyKeySelect value={myKey} onChange={handleKeyChange} size="md" />}
              {confidence && (
                <AddToSetPanel
                  songId={song.id}
                  sets={userSets}
                  inSets={songInSets}
                  direction="down"
                  onOpen={loadSetData}
                  onAdded={(setId) => setSongInSets((prev) => new Set([...prev, setId]))}
                  onSetCreated={(s) => setUserSets((prev) => [s, ...(prev ?? [])])}
                />
              )}
              {confidence && (
                <ChordChartSlot
                  songId={song.id}
                  url={song.chord_chart_url}
                  canAdd={isAdmin || isSongEditor}
                  size="md"
                  onAdded={handleChartAdded}
                />
              )}
            </RepertoireButton>
            {!confidence && (
              <ChordChartSlot
                songId={song.id}
                url={song.chord_chart_url}
                canAdd={isAdmin || isSongEditor}
                size="md"
                onAdded={handleChartAdded}
              />
            )}
          </div>
          {confidence && userId && <MySongNotes key={song.id} songId={song.id} userId={userId} className="mt-3" />}
          {song.chord_chart_url && <UgBackTip className="mt-3" />}
        </div>

        {(composers.length > 0 || lyricists.length > 0) && (
          <div className="mt-3 flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Songwriter(s)</p>
            {composers.length > 0 && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Music:</span> {formatComposersLong(composers, musicCultures)}
              </p>
            )}
            {lyricists.length > 0 && (
              <p className="text-sm text-slate-600">
                <span className="font-medium">Lyrics:</span> {formatComposersLong(lyricists, lyricsCultures)}
              </p>
            )}
          </div>
        )}
      </div>

      {(recordingArtists.length > 0 || song.year_written) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          {song.year_written && (
            <p className="text-sm text-slate-600">
              <span className="font-medium text-slate-700">Written:</span> {song.year_written}
            </p>
          )}
          {recordingArtists.length > 0 && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recordings</h2>
              <div className="flex flex-wrap gap-2">
                {recordingArtists.map((a: any, i: number) => (
                  <span key={i} className="flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                    {a.name}
                    {a.year && <span className="text-slate-400">{a.year}</span>}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {(() => {
        type ArtistEmbed = { name: string; year: number | null; videoId: string | null; trackId: string | null };

        const artistEmbeds: ArtistEmbed[] = recordingArtists
          .map((a) => {
            let videoId: string | null = null;
            if (a.youtube_url) {
              try { videoId = new URL(a.youtube_url).searchParams.get("v"); } catch { /* ignore */ }
            }
            const trackId = a.spotify_url?.split("/track/")[1]?.split("?")[0] ?? null;
            if (!videoId && !trackId) return null;
            return { name: a.name, year: a.year, videoId, trackId };
          })
          .filter(Boolean) as ArtistEmbed[];

        const fallbackVideoId = (() => {
          if (artistEmbeds.some((e) => e.videoId) || !song.youtube_url) return null;
          try { return new URL(song.youtube_url).searchParams.get("v"); } catch { return null; }
        })();

        if (artistEmbeds.length === 0 && !fallbackVideoId) return null;

        const showLabel = artistEmbeds.length > 1;

        return (
          <div className="space-y-4">
            {artistEmbeds.map((e, i) => (
              <div key={i} className="space-y-2">
                {showLabel && (
                  <p className="px-1 text-sm font-medium text-slate-500">
                    {e.name}{e.year && <span className="ml-2 font-normal text-slate-400">{e.year}</span>}
                  </p>
                )}
                {e.videoId && (
                  <section className="rounded-xl overflow-hidden border border-slate-200">
                    <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                      <iframe
                        className="absolute inset-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${e.videoId}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </section>
                )}
                {e.trackId && (
                  <section className="rounded-xl overflow-hidden border border-slate-200">
                    <iframe
                      src={`https://open.spotify.com/embed/track/${e.trackId}`}
                      width="100%"
                      height="80"
                      allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
                      loading="lazy"
                    />
                  </section>
                )}
              </div>
            ))}
            {fallbackVideoId && (
              <section className="rounded-xl overflow-hidden border border-slate-200">
                <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                  <iframe
                    className="absolute inset-0 w-full h-full"
                    src={`https://www.youtube.com/embed/${fallbackVideoId}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
              </section>
            )}
          </div>
        );
      })()}

      {(song.first_line || song.hook || song.genius_url) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Lyrics</h2>
          {song.first_line && (
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-500">Opens: </span>
              <em>{song.first_line}</em>
            </p>
          )}
          {song.hook && (
            <p className="text-sm text-slate-700">
              <span className="font-medium text-slate-500">Hook: </span>
              <em>{song.hook}</em>
            </p>
          )}
          {song.genius_url && (
            <a href={song.genius_url} target="_blank" rel="noopener noreferrer"
              className="inline-block rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-amber-400 hover:text-amber-600">
              Full lyrics
            </a>
          )}
        </section>
      )}

      {(tonalityPills.length > 0 || meterPills.length > 0 || song.vibe) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Musical properties</h2>
          {tonalityPills.length > 0 && <TagRow label="Tonality" tags={tonalityPills} />}
          {meterPills.length > 0 && <TagRow label="Meter" tags={meterPills} />}
          {song.vibe && <TagRow label="Vibe" tags={[song.vibe]} />}
        </section>
      )}

      {(genres.length > 0 || themes.length > 0 || cultures.length > 0 || languages.length > 0) && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tags</h2>
          {genres.length > 0 && <TagRow label="Genres" tags={genres} />}
          {themes.length > 0 && <TagRow label="Themes" tags={themes} />}
          {languages.length > 0 && <TagRow label="Languages" tags={languages} />}
          {cultures.length > 0 && <TagRow label="Cultures" tags={cultures} />}
        </section>
      )}

      {song.notes && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</h2>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{song.notes}</p>
        </section>
      )}

      {isLoggedIn ? (
        <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Jammers</h2>
          {songUsersLoading ? (
            <div className="space-y-2">
              <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-100" />
            </div>
          ) : songUsers && (songUsers.lead.length > 0 || songUsers.support.length > 0 || songUsers.learn.length > 0) ? (
            <div className="space-y-2">
              {songUsers.lead.length > 0 && <JammerRow level="lead" label="Lead" jammers={songUsers.lead} />}
              {songUsers.support.length > 0 && <JammerRow level="support" label="Support" jammers={songUsers.support} />}
              {songUsers.learn.length > 0 && <JammerRow level="learn" label="Learning" jammers={songUsers.learn} />}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No jammers have added this song yet.</p>
          )}
        </section>
      ) : (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-base font-semibold text-zinc-900">
            {popularity > 0
              ? `${popularity} ${popularity === 1 ? "jammer knows" : "jammers know"} this song`
              : "Find jammers who know this song"}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {popularity > 0 ? "Sign up to see who — and find your next jam." : "Sign up and be the first to add it."}
          </p>
          <Link
            href={`/auth?next=${encodeURIComponent(pathname)}`}
            className="mt-4 inline-block text-sm font-medium text-amber-600 hover:text-amber-500"
          >
            Sign in →
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <RepertoireButton songId={song.id} initialConfidence={confidence} singingVoice={singingVoice} onConfidenceChange={handleConfidenceChange}>
            {confidence && <MyKeySelect value={myKey} onChange={handleKeyChange} size="md" />}
            {confidence && (
              <AddToSetPanel
                songId={song.id}
                sets={userSets}
                inSets={songInSets}
                direction="up"
                onOpen={loadSetData}
                onAdded={(setId) => setSongInSets((prev) => new Set([...prev, setId]))}
                onSetCreated={(s) => setUserSets((prev) => [s, ...(prev ?? [])])}
              />
            )}
            {confidence && (
              <ChordChartSlot
                songId={song.id}
                url={song.chord_chart_url}
                canAdd={isAdmin || isSongEditor}
                size="md"
                onAdded={handleChartAdded}
              />
            )}
          </RepertoireButton>
          {!confidence && (
            <ChordChartSlot
              songId={song.id}
              url={song.chord_chart_url}
              canAdd={isAdmin || isSongEditor}
              size="md"
              onAdded={handleChartAdded}
            />
          )}
        </div>
        <Link href={confidence ? "/repertoire" : "/search"}
          className="mt-2 text-center text-sm text-slate-500 hover:text-slate-700 sm:mt-0 sm:text-left">
          {confidence ? "← Back to repertoire" : "← Back to search"}
        </Link>
      </div>

      {confidence && userId && (
        <div className="border-t border-slate-100 pt-4 text-center sm:text-left">
          {confirmingRemove ? (
            <div className="inline-flex flex-col items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 sm:items-start">
              <p className="text-sm text-red-700">
                Remove &ldquo;{song.title}&rdquo; from your repertoire? Your key and notes for it will be deleted.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRemoveFromRepertoire}
                  disabled={removing}
                  className="rounded-full bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
                >
                  {removing ? "Removing…" : "Remove"}
                </button>
                <button onClick={() => setConfirmingRemove(false)} className="text-sm text-slate-500 hover:text-slate-700">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingRemove(true)}
              className="rounded-full border border-zinc-200 px-2 py-1 text-xs text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors"
            >
              Remove from my repertoire
            </button>
          )}
        </div>
      )}
    </div>
  );
}
