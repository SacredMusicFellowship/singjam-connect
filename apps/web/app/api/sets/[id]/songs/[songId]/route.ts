import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiUser } from "@/lib/supabase/apiUser";
import { canManageSet, canRemoveSetSong, keyForNewLeaders, normalizeSetSongNote, SET_SONG_NOTE_MAX } from "@singjam/core";

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
    admin.from("set_collaborators").select("role").eq("set_id", setId).eq("user_id", user.id).eq("status", "accepted").maybeSingle(),
  ]);
  const role = (collabRes.data as { role: string } | null)?.role;
  if (!ownerRes.data && !role) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();

  // Event guests join sets as editors or viewers; the only change they can make
  // to a set song is putting themselves forward to lead it.
  if ("self_leader" in body) return toggleSelfLeader(admin, setId, songId, user.id, body.self_leader === true);
  if (!canManageSet(!!ownerRes.data, role)) {
    return NextResponse.json({ error: "Only the set's owner and co-owners can change this" }, { status: 403 });
  }
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
  // The client settles its leader pills on what was saved, not on what it sent.
  return NextResponse.json({
    ok: true,
    ...("key_note" in updates ? { key_note: updates.key_note } : {}),
    ...("leader_user_ids" in updates ? { leader_user_ids: updates.leader_user_ids } : {}),
  });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; songId: string }> }
) {
  const { id: setId, songId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const [ownerRes, collabRes, rowRes] = await Promise.all([
    admin.from("sets").select("id").eq("id", setId).eq("owner_user_id", user.id).maybeSingle(),
    admin.from("set_collaborators").select("role").eq("set_id", setId).eq("user_id", user.id).eq("status", "accepted").maybeSingle(),
    admin.from("set_songs").select("added_by_user_id").eq("set_id", setId).eq("song_id", songId).maybeSingle(),
  ]);
  const role = (collabRes.data as { role: string } | null)?.role;
  const addedBy = (rowRes.data as { added_by_user_id: string | null } | null)?.added_by_user_id;
  if (!canRemoveSetSong(!!ownerRes.data, role, addedBy, user.id)) {
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

async function toggleSelfLeader(
  admin: ReturnType<typeof supabaseAdmin>,
  setId: string,
  songId: string,
  userId: string,
  lead: boolean,
) {
  const [{ data: current }, { data: mine }] = await Promise.all([
    admin.from("set_songs").select("leader_user_ids, key_note").eq("set_id", setId).eq("song_id", songId).maybeSingle(),
    admin.from("user_songs").select("confidence, key_note").eq("user_id", userId).eq("song_id", songId).maybeSingle(),
  ]);
  if (!current) return NextResponse.json({ error: "Song not found in this set" }, { status: 404 });
  const row = current as { leader_user_ids: string[] | null; key_note: string | null };
  const me = mine as { confidence: string; key_note: string | null } | null;
  if (lead && me?.confidence !== "lead") {
    return NextResponse.json({ error: "Mark this song as one you lead before picking yourself" }, { status: 403 });
  }

  const previous = row.leader_user_ids ?? [];
  const next = lead
    ? (previous.includes(userId) ? previous : [...previous, userId])
    : previous.filter((id) => id !== userId);
  const updates: Record<string, unknown> = { leader_user_ids: next };
  // A guest's own key only fills an empty one; changing a set key is for co-owners.
  if (lead && !previous.includes(userId) && !row.key_note && me?.key_note) updates.key_note = me.key_note;

  const { error } = await admin.from("set_songs").update(updates).eq("set_id", setId).eq("song_id", songId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, ...updates });
}
