import { NextResponse } from "next/server";
import { supabaseAdmin as admin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { findExistingSong, findOnSpotify } from "@/lib/songLookup";
import { triggerSongEnrichment } from "@/lib/triggerSongEnrichment";

async function findOrCreateArtist(db: ReturnType<typeof admin>, name: string): Promise<string | null> {
  const { data: found } = await db.from("artists").select("id").ilike("name", name).limit(1).maybeSingle();
  if (found) return found.id;
  const { data: created } = await db.from("artists").insert({ name }).select("id").single();
  return created?.id ?? null;
}

// Adds a song the user has confirmed (title, artist and the Spotify/YouTube match
// from /api/songs/lookup). Everything else — writers, years, key, tags, lyrics —
// is filled in afterwards by the enrichment job; nobody reviews it by hand.
// Older clients send only title/artist; those are matched on Spotify here.
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
  let artist: string | null = body.artist?.trim() || null;
  let spotifyUrl: string | null = body.spotify_url ?? null;
  let releaseYear: number | null = typeof body.release_year === "number" ? body.release_year : null;
  const youtubeUrl: string | null =
    body.youtube_official && /^[A-Za-z0-9_-]{11}$/.test(body.youtube_id ?? "") ? `https://www.youtube.com/watch?v=${body.youtube_id}` : null;

  if (!body.confirmed) {
    const match = await findOnSpotify(title, artist ?? "").catch(() => null);
    if (match) ({ title, artist, spotify_url: spotifyUrl, release_year: releaseYear } = match);
  }

  const db = admin();
  const existing = await findExistingSong(db, [title, body.title.trim()], artist);
  if (existing && (existing.match === "same" || !body.add_anyway)) {
    return NextResponse.json({ error: "This song is already in our library.", id: existing.id, slug: existing.slug }, { status: 409 });
  }

  const { data: song, error: songErr } = await db
    .from("songs")
    .insert({ title, display_artist: artist, submitted_by: user.id, updated_at: new Date().toISOString(), enrichment_started_at: new Date().toISOString() })
    .select("id, slug")
    .single();
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
        youtube_url: youtubeUrl,
        ...(youtubeUrl ? { youtube_ok: true } : {}),
      });
    }
  }

  await triggerSongEnrichment(song.id, releaseYear);
  return NextResponse.json({ id: song.id, slug: song.slug });
}
