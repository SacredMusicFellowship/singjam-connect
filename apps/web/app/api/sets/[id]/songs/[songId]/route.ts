import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiUser } from "@/lib/supabase/apiUser";
import { keyForNewLeaders, normalizeSetSongNote, SET_SONG_NOTE_MAX } from "@singjam/core";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; songId: string }> }
) {
  const { id: setId, songId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const [ownerRes, collabRes] = await Promise.all([
    admin.from("sets").select("id").eq("id", setId).eq("owner_user_id", user.id).maybeSingle(),
    admin.from("set_collaborators").select("id").eq("set_id", setId).eq("user_id", user.id).eq("status", "accepted").in("role", ["editor", "co-owner"]).maybeSingle(),
  ]);
  if (!ownerRes.data && !collabRes.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if ("key_note" in body) updates.key_note = body.key_note as string | null;
  if ("played" in body) updates.played = Boolean(body.played);
  if ("notes" in body) {
    const notes = normalizeSetSongNote(body.notes);
    if (notes === undefined) {
      return NextResponse.json({ error: `Notes must be ${SET_SONG_NOTE_MAX} characters or fewer` }, { status: 400 });
    }
    updates.notes = notes;
  }
  if ("leader_user_ids" in body && Array.isArray(body.leader_user_ids)) {
    const nextLeaderIds: string[] = body.leader_user_ids;
    updates.leader_user_ids = nextLeaderIds;
    if (nextLeaderIds.length > 0) {
      const { data: current } = await admin
        .from("set_songs")
        .select("leader_user_ids")
        .eq("set_id", setId)
        .eq("song_id", songId)
        .maybeSingle();
      const previousLeaderIds: string[] = (current as any)?.leader_user_ids ?? [];

      await admin.from("user_songs").upsert(
        nextLeaderIds.map((userId: string) => ({ user_id: userId, song_id: songId, confidence: "lead" })),
        { onConflict: "user_id,song_id" }
      );

      // A newly selected leader brings their own key; editors can still change it after.
      const added = nextLeaderIds.filter((id) => !previousLeaderIds.includes(id));
      if (added.length > 0 && !("key_note" in body)) {
        const { data: keyRows } = await admin
          .from("user_songs")
          .select("user_id, key_note")
          .eq("song_id", songId)
          .in("user_id", added);
        const personalKeys = new Map(
          ((keyRows ?? []) as { user_id: string; key_note: string | null }[])
            .filter((r) => r.key_note)
            .map((r) => [r.user_id, r.key_note!])
        );
        const key = keyForNewLeaders(previousLeaderIds, nextLeaderIds, personalKeys);
        if (key) updates.key_note = key;
      }
    }
  }
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No valid fields" }, { status: 400 });

  const { error } = await admin
    .from("set_songs")
    .update(updates)
    .eq("set_id", setId)
    .eq("song_id", songId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json("key_note" in updates ? { ok: true, key_note: updates.key_note } : { ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; songId: string }> }
) {
  const { id: setId, songId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const [ownerRes, collabRes] = await Promise.all([
    admin.from("sets").select("id").eq("id", setId).eq("owner_user_id", user.id).maybeSingle(),
    admin.from("set_collaborators").select("id").eq("set_id", setId).eq("user_id", user.id).eq("status", "accepted").in("role", ["editor", "co-owner"]).maybeSingle(),
  ]);
  if (!ownerRes.data && !collabRes.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("set_songs")
    .delete()
    .eq("set_id", setId)
    .eq("song_id", songId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
