import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { getSpotifyToken } from "@/lib/spotify";

export async function GET(req: Request) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const artist = searchParams.get("artist")?.trim() ?? "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const token = await getSpotifyToken();
  if (!token) return NextResponse.json({ spotify_url: null });

  try {
    const q = artist ? `track:${title} artist:${artist}` : `track:${title}`;
    const res = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return NextResponse.json({ spotify_url: null });
    const data = await res.json();
    const spotify_url = (data.tracks?.items?.[0]?.external_urls?.spotify as string) ?? null;
    return NextResponse.json({ spotify_url });
  } catch {
    return NextResponse.json({ spotify_url: null });
  }
}
