import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { isJamCohost } from "@/lib/jamCohosts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const { data } = await supabase
    .from("sets")
    .select("id, short_code, name")
    .eq("jam_id", id)
    .maybeSingle();

  return NextResponse.json({ set: data ?? null });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: jam } = await supabase.from("jams").select("host_user_id").eq("id", jamId).single();
  if (!jam || (jam.host_user_id !== user.id && !(await isJamCohost(admin, jamId, user.id)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { setId } = await req.json();
  if (!setId) return NextResponse.json({ error: "setId is required" }, { status: 400 });

  const { data: set } = await supabase.from("sets").select("owner_user_id, jam_id").eq("id", setId).single();
  if (!set) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let canLink = set.owner_user_id === user.id;
  if (!canLink) {
    const { data: collab } = await supabase
      .from("set_collaborators")
      .select("role")
      .eq("set_id", setId)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .maybeSingle();
    canLink = collab?.role === "editor";
  }
  if (!canLink) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Use admin here: app-level authorization is already verified above, but the
  // "sets_update" RLS policy only allows the set's owner — a non-owning editor
  // collaborator's own session would otherwise silently no-op this write.
  const { error } = await admin.from("sets").update({ jam_id: jamId }).eq("id", setId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const [rsvpRes, existingCollabRes] = await Promise.all([
    admin.from("jam_rsvps").select("user_id").eq("jam_id", jamId).eq("status", "attending"),
    admin.from("set_collaborators").select("user_id").eq("set_id", setId),
  ]);

  const existingUserIds = new Set<string>([
    user.id,
    set.owner_user_id,
    ...((existingCollabRes.data ?? []) as any[]).map((c: any) => c.user_id),
  ]);

  const attendeeIds = new Set<string>(((rsvpRes.data ?? []) as any[]).map((r: any) => r.user_id));
  attendeeIds.add(jam.host_user_id);

  const newCollaborators = [...attendeeIds].filter((uid) => !existingUserIds.has(uid));
  if (newCollaborators.length > 0) {
    await admin.from("set_collaborators").insert(
      newCollaborators.map((uid) => ({
        set_id: setId,
        user_id: uid,
        invited_by: user.id,
        status: "accepted",
        role: "editor",
      }))
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: jam } = await supabase.from("jams").select("host_user_id").eq("id", jamId).single();
  if (!jam || (jam.host_user_id !== user.id && !(await isJamCohost(admin, jamId, user.id)))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Same reasoning as PUT above — the caller (host/co-host) may not own the
  // linked set, so this must bypass the owner-only "sets_update" RLS policy.
  const { error } = await admin.from("sets").update({ jam_id: null }).eq("jam_id", jamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
