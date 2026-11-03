import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { resolveApiUser } from "@/lib/supabase/apiUser";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const admin = supabaseAdmin();

  const { data: set } = await admin
    .from("sets")
    .select("owner_user_id, link_sharing")
    .eq("id", setId)
    .maybeSingle();

  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = user?.id === (set as any).owner_user_id;

  if (!isOwner && (set as any).link_sharing !== "public") {
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: collab } = await admin
      .from("set_collaborators")
      .select("id")
      .eq("set_id", setId)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .maybeSingle();
    if (!collab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("set_songs")
    .select("id, song_id, position, songs(title, display_artist, slug, chord_chart_url, youtube_url, spotify_url, song_recording_artists(position, youtube_url))")
    .eq("set_id", setId)
    .order("position", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ songs: data ?? [] });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { songId, songIds, confidence } = await req.json();

  // Two shapes: `songId` adds one song (web's per-song and bulk callers), while
  // `songIds` adds a whole selection in one request. Native's Add-to-Set can
  // carry an arbitrarily large multi-select, and firing one request per song
  // from a phone is both slow and racy — every concurrent handler would read
  // the same max position and write songs on top of each other.
  const ids: string[] = Array.isArray(songIds)
    ? songIds.filter((s): s is string => typeof s === "string" && s.length > 0)
    : songId
    ? [songId]
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "songId or songIds is required" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Viewers may read a set but not change it — same bar as DELETE and PATCH on
  // this resource. Adding used to accept any accepted collaborator, which let a
  // viewer put songs into a set they then couldn't remove.
  const [ownerRes, collabRes] = await Promise.all([
    admin.from("sets").select("id").eq("id", setId).eq("owner_user_id", user.id).maybeSingle(),
    admin.from("set_collaborators").select("id").eq("set_id", setId).eq("user_id", user.id).eq("status", "accepted").in("role", ["editor", "co-owner"]).maybeSingle(),
  ]);
  if (!ownerRes.data && !collabRes.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (confidence && ["lead", "support", "learn"].includes(confidence)) {
    await admin
      .from("user_songs")
      .upsert(
        ids.map((song_id) => ({ user_id: user.id, song_id, confidence })),
        { onConflict: "user_id,song_id" }
      );
  }

  const { data: maxRow } = await admin
    .from("set_songs")
    .select("position")
    .eq("set_id", setId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const startPosition = maxRow ? (maxRow as any).position + 1 : 0;
  const rows = ids.map((song_id, i) => ({
    set_id: setId,
    song_id,
    position: startPosition + i,
    added_by_user_id: user.id,
  }));
  const columns =
    "id, song_id, position, key_note, notes, played, leader_user_ids, songs(title, display_artist, slug, chord_chart_url, youtube_url, tonality, song_recording_artists(position, youtube_url, spotify_url))";

  // Single-song adds keep reporting a duplicate as 409 — web surfaces it as
  // "Already in that set". A batch can't: one song the caller already has would
  // fail the insert as a unit and silently drop the rest, so it skips conflicts
  // (unique(set_id, song_id), migration 079) and reports what actually landed.
  if (!Array.isArray(songIds)) {
    const { data, error } = await admin
      .from("set_songs")
      .insert(rows[0])
      .select(columns)
      .single();

    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Song already in set" }, { status: 409 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const { data: knowledge } = await admin
      .from("user_songs")
      .select("user_id, song_id, confidence, key_note")
      .eq("song_id", ids[0]);

    return NextResponse.json({ song: data, knowledge: knowledge ?? [] });
  }

  const { data, error } = await admin
    .from("set_songs")
    .upsert(rows, { onConflict: "set_id,song_id", ignoreDuplicates: true })
    .select(columns);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: knowledge } = await admin
    .from("user_songs")
    .select("user_id, song_id, confidence, key_note")
    .in("song_id", ids);

  return NextResponse.json({ songs: data ?? [], added: (data ?? []).length, knowledge: knowledge ?? [] });
}
