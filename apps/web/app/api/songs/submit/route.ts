import { NextResponse } from "next/server";
import { supabaseAdmin as admin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { findExistingSong, findKnownArtist, findOnSpotify, findTextTunes, spotifyTrack } from "@/lib/songLookup";
import { triggerSongEnrichment } from "@/lib/triggerSongEnrichment";
import { idsFor, tagIds } from "@/lib/songEnrichment";
import { parseTagSpecs, parseWriters } from "@/lib/songAddDetails";
import { cleanTuneName, isPlaceholderArtist, parseAddHints, parseRecordingLink } from "@singjam/core";

// The tag names of the jam a set belongs to, as context for enrichment.
async function setContext(db: ReturnType<typeof admin>, setId: unknown): Promise<string[]> {
  if (typeof setId !== "string" || !/^[0-9a-f-]{36}$/i.test(setId)) return [];
  const { data: set } = await db.from("sets").select("jam_id").eq("id", setId).maybeSingle();
  if (!set?.jam_id) return [];
  const { data } = await db.from("jam_tags").select("tags(name)").eq("jam_id", set.jam_id);
  return ((data ?? []) as any[]).map((r) => r.tags?.name).filter((n): n is string => !!n);
}

async function findOrCreateArtist(db: ReturnType<typeof admin>, name: string): Promise<string | null> {
  const known = await findKnownArtist(db, name);
  if (known) return known.id;
  const { data: created } = await db.from("artists").insert({ name }).select("id").single();
  return created?.id ?? null;
}

// Adds a song the user has confirmed (title, artist and the Spotify/YouTube match
// from /api/songs/lookup). Everything else — writers, years, key, tags, lyrics —
// is filled in afterwards by the enrichment job; nobody reviews it by hand.
// Older clients send only title/artist; those are matched on Spotify here.
// Admins and song editors (the CSV import) may also send sourced writers and
// tags and a first line, which enrichment then leaves alone, and no_recording
// for a traditional song that has no recording to match. Anyone may add hints
// (known_as, first_line_hint, and set_id for the set it's being added to),
// which enrichment uses but never saves as facts on their own.
export async function POST(req: Request) {
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.title?.trim()) return NextResponse.json({ error: "Title is required" }, { status: 400 });

  let title: string = body.title.trim();
  const noRecording = body.no_recording === true;
  let artist: string | null = noRecording || isPlaceholderArtist(body.artist) ? null : body.artist?.trim() || null;
  let spotifyUrl: string | null = body.spotify_url ?? null;
  let releaseYear: number | null = typeof body.release_year === "number" ? body.release_year : null;
  const confirmedVideo = body.confirmed && /^[A-Za-z0-9_-]{11}$/.test(body.youtube_id ?? "") ? `https://www.youtube.com/watch?v=${body.youtube_id}` : null;
  // A video goes on the recording only when it's that artist's official upload
  // (the hourly backfill finds one later otherwise). Any other video the person
  // confirmed is kept as the song's own, which shows until the recording has one.
  const youtubeUrl = body.youtube_official ? confirmedVideo : null;

  if (!body.confirmed && !noRecording) {
    const match = await findOnSpotify(title, artist ?? "").catch(() => null);
    if (match && !isPlaceholderArtist(match.artist)) ({ title, artist, spotify_url: spotifyUrl, release_year: releaseYear } = match);
    // The CSV import's titles are sourced; Spotify's track name ("Graves Into
    // Gardens (Live)", "Trust In God (feat. Chris Brown)") only supplies the recording.
    if (match && body.keep_title === true) title = body.title.trim();
  }

  const db = admin();
  // Whatever the client sent, a misspelling of an artist we have becomes our spelling.
  if (artist) artist = (await findKnownArtist(db, artist))?.name ?? artist;
  const writers = parseWriters(body.writers);
  const tagSpecs = parseTagSpecs(body.tags);
  const firstLine = typeof body.first_line === "string" ? body.first_line.trim() || null : null;
  if (writers.length || tagSpecs.length || firstLine) {
    const { data: profile } = await db.from("profiles").select("role").eq("id", user.id).single();
    if (!["admin", "song_editor"].includes(profile?.role)) {
      return NextResponse.json({ error: "Only song editors can set writers, tags or a first line when adding a song" }, { status: 403 });
    }
  }
  const existing = await findExistingSong(db, [title, body.title.trim()], artist);
  let songVideo = youtubeUrl && artist ? null : confirmedVideo;
  let recordingVideo = youtubeUrl;
  let hints = parseAddHints(body, await setContext(db, body.set_id));
  let textId: string | null = null;
  let tuneId: string | null = null;

  // Another tune of a text we hold is a song of its own (one card per tune),
  // added only with a recording of it, which is how we know which melody it is.
  // A song with a recording artist and no tune sent is a different song that
  // shares the title (a pop "Hallelujah" beside the hymn), added the usual way.
  const family = existing && body.add_anyway && (body.new_tune || !artist) ? await findTextTunes(db, existing.id) : null;
  if (existing && family) {
    const link = parseRecordingLink(body.new_tune?.recording_url);
    if (!link) return NextResponse.json({ error: "Add a link to a recording of this tune, so we know which melody it is." }, { status: 400 });
    const tuneName = cleanTuneName(body.new_tune?.name);
    let tuneHint: string | null = null;
    if (tuneName) {
      const { data: tune, error: tuneErr } = await db.from("tunes").select("id").ilike("name", tuneName.replace(/[\\%_]/g, "\\$&")).limit(1).maybeSingle();
      if (tuneErr) return NextResponse.json({ error: tuneErr.message }, { status: 500 });
      const taken = tune && family.tunes.find((t) => t.tune_id === tune.id);
      if (taken) return NextResponse.json({ error: "This tune is already in our library.", id: taken.id, slug: taken.slug }, { status: 409 });
      if (tune) tuneId = tune.id;
      else tuneHint = tuneName;
    }
    textId = family.text_id;
    title = existing.title;
    artist = null;
    spotifyUrl = null;
    releaseYear = null;
    recordingVideo = null;
    songVideo = link.kind === "youtube" ? link.url : null;
    if (link.kind === "spotify") {
      const track = await spotifyTrack(link.trackId).catch(() => null);
      if (!track?.artist || isPlaceholderArtist(track.artist))
        return NextResponse.json({ error: "We couldn't read that Spotify link. Try a YouTube link instead." }, { status: 400 });
      artist = (await findKnownArtist(db, track.artist))?.name ?? track.artist;
      spotifyUrl = link.url;
      releaseYear = track.release_year;
    }
    hints = { ...hints, other_tune: true, ...(tuneHint ? { tune: tuneHint } : {}) };
  } else if (existing && (existing.match === "same" || !body.add_anyway)) {
    return NextResponse.json({ error: "This song is already in our library.", id: existing.id, slug: existing.slug }, { status: 409 });
  }

  const { data: song, error: songErr } = await db
    .from("songs")
    .insert({
      title, display_artist: artist, first_line: firstLine, submitted_by: user.id, updated_at: new Date().toISOString(), enrichment_started_at: new Date().toISOString(),
      add_hints: hints, youtube_url: songVideo, text_id: textId, tune_id: tuneId,
    })
    .select("id, slug")
    .single();
  // Two songs with one title and no artist or tune can't both be added (songs_title_artist_unique).
  if (songErr?.code === "23505") {
    return NextResponse.json({ error: "A song with this title is already in our library. Open it, or ask a song editor to name its tune." }, { status: 409 });
  }
  if (songErr || !song) {
    return NextResponse.json({ error: songErr?.message ?? "Failed to create song" }, { status: 500 });
  }

  if (artist) {
    const artistId = await findOrCreateArtist(db, artist);
    if (artistId) {
      await db.from("song_recording_artists").insert({
        song_id: song.id,
        artist_id: artistId,
        position: 0,
        spotify_url: spotifyUrl,
        youtube_url: recordingVideo,
        ...(recordingVideo ? { youtube_ok: true } : {}),
      });
    }
  }

  if (writers.length) {
    const people = (await idsFor(db, "people", writers)).map((person_id) => ({ song_id: song.id, person_id }));
    await db.from("song_composers").insert(people);
    await db.from("song_lyricists").insert(people);
  }
  for (const type of new Set(tagSpecs.map((t) => t.type))) {
    const ids = await tagIds(db, type, tagSpecs.filter((t) => t.type === type).map((t) => t.name));
    if (ids.length) await db.from("song_tags").insert(ids.map((tag_id) => ({ song_id: song.id, tag_id, context: "general" })));
  }

  await triggerSongEnrichment(song.id, releaseYear);
  return NextResponse.json({ id: song.id, slug: song.slug });
}
