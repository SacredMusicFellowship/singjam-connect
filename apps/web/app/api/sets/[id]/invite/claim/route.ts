import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const admin = supabaseAdmin();

  const { data: invite } = await admin
    .from("set_collaborators")
    .select("id, set_id, user_id, status")
    .eq("token", token)
    .eq("set_id", setId)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  if ((invite as any).user_id && (invite as any).user_id !== user.id) {
    return NextResponse.json({ error: "Invite already used" }, { status: 409 });
  }

  if ((invite as any).user_id === user.id && (invite as any).status === "accepted") {
    return NextResponse.json({ ok: true, alreadyCollaborator: true });
  }

  const { data: set } = await admin
    .from("sets")
    .select("owner_user_id")
    .eq("id", setId)
    .single();

  if ((set as any)?.owner_user_id === user.id) {
    return NextResponse.json({ ok: true, alreadyOwner: true });
  }

  const { data: existingCollabs } = await admin
    .from("set_collaborators")
    .select("id")
    .eq("set_id", setId)
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .limit(1);

  if (existingCollabs && existingCollabs.length > 0) {
    // Delete the stale unclaimed invite so it can't be used again
    await admin.from("set_collaborators").delete().eq("id", (invite as any).id);
    return NextResponse.json({ ok: true, alreadyCollaborator: true });
  }

  await admin
    .from("set_collaborators")
    .update({ user_id: user.id, status: "accepted", invitee_email: null })
    .eq("id", (invite as any).id);

  return NextResponse.json({ ok: true, setId });
}
