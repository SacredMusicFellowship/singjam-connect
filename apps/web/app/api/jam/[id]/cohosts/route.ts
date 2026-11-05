import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { createNotification } from "@/lib/notifications";
import { canEditJam } from "@singjam/core";
import type { SupabaseClient } from "@supabase/supabase-js";

// Co-hosts are appointed by whoever can edit the jam: its host, or on an
// official event anyone who can host official events (the creator of an
// official event is often not the person running it). Co-hosts can't appoint
// more co-hosts.
async function mayAppointCohosts(
  admin: SupabaseClient,
  jam: { host_user_id: string | null; visibility: string | null },
  userId: string
) {
  if (jam.host_user_id === userId) return true;
  if (jam.visibility !== "official") return false;
  const { data: profile } = await admin.from("profiles").select("can_host_official").eq("id", userId).maybeSingle();
  return canEditJam(jam, { id: userId, can_host_official: (profile as any)?.can_host_official });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: jam } = await admin.from("jams").select("host_user_id, name, visibility").eq("id", jamId).single();
  if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });
  if (!(await mayAppointCohosts(admin, jam, user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: rsvp } = await admin
    .from("jam_rsvps")
    .select("status")
    .eq("jam_id", jamId)
    .eq("user_id", userId)
    .maybeSingle();
  if (rsvp?.status !== "attending") {
    return NextResponse.json({ error: "Only attendees can be made co-host" }, { status: 400 });
  }

  const { error } = await admin
    .from("jam_cohosts")
    .insert({ jam_id: jamId, user_id: userId, added_by: user.id });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await createNotification({
    userId,
    type: "jam_cohost_added",
    title: `You're now a co-host of ${jam.name ?? "a jam"}`,
    link: `/jam/${jamId}`,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: jamId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await req.json();
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: jam } = await admin.from("jams").select("host_user_id, visibility").eq("id", jamId).single();
  if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });
  if (!(await mayAppointCohosts(admin, jam, user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await admin
    .from("jam_cohosts")
    .delete()
    .eq("jam_id", jamId)
    .eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
