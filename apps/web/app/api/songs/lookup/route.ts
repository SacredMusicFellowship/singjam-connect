import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { supabaseAdmin as admin } from "@/lib/supabase/admin";
import { findExistingSong, findOnSpotify, findOnYouTube } from "@/lib/songLookup";
import { isPlaceholderArtist } from "@singjam/core";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const title = req.nextUrl.searchParams.get("title")?.trim() ?? "";
  const artist = req.nextUrl.searchParams.get("artist")?.trim() ?? "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  try {
    const found = await findOnSpotify(title, artist);
    // A track credited to "Traditional" has no performer to keep, so it's no match.
    const spotify = found && !isPlaceholderArtist(found.artist) ? found : null;
    const canonical = { title: spotify?.title ?? title, artist: spotify?.artist ?? (isPlaceholderArtist(artist) ? "" : artist) };
    const [youtube, existing] = await Promise.all([
      // With no artist (a traditional song or hymn) the preview is searched by title alone.
      findOnYouTube(canonical.title, canonical.artist),
      findExistingSong(admin(), [canonical.title, title], canonical.artist || artist || null),
    ]);
    return NextResponse.json({
      title: canonical.title,
      artist: canonical.artist || null,
      spotify_url: spotify?.spotify_url ?? null,
      release_year: spotify?.release_year ?? null,
      youtube_id: youtube?.youtube_id ?? null,
      youtube_official: youtube?.youtube_official ?? false,
      existing,
    });
  } catch {
    return NextResponse.json({ title, artist: artist || null, spotify_url: null, release_year: null, youtube_id: null, youtube_official: false, existing: null });
  }
}
