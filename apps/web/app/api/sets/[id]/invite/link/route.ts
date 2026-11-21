import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiUser } from "@/lib/supabase/apiUser";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const admin = supabaseAdmin();

  const { data: set } = await admin
    .from("sets")
    .select("id, short_code, name, owner_user_id")
    .eq("id", setId)
    .maybeSingle();

  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  const isOwner = (set as any).owner_user_id === user.id;
  if (!isOwner) {
    const { data: collab } = await admin
      .from("set_collaborators")
      .select("id")
      .eq("set_id", setId)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .in("role", ["editor", "co-owner"])
      .maybeSingle();
    if (!collab) return NextResponse.json({ error: "Only editors can invite collaborators" }, { status: 403 });
  }

  // Shareable links only ever grant editor/viewer — the higher-privilege co-owner
  // role must be assigned to a specific, named user by the owner.
  const role: "editor" | "viewer" = body.role === "viewer" ? "viewer" : "editor";

  const { data: inserted } = await admin
    .from("set_collaborators")
    .insert({ set_id: setId, invited_by: user.id, role })
    .select("id, token")
    .single();

  const { id: inviteId, token } = inserted as any;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";
  const url = `${baseUrl}/set/${(set as any).short_code}?invite=${token}`;
  const message = `Join my set list! ${(set as any).name}: ${url}`;

  return NextResponse.json({ inviteId, url, message });
}

// Removes a collaborator or cancels a pending link invite
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteId } = await req.json();
  if (!inviteId) return NextResponse.json({ error: "Missing inviteId" }, { status: 400 });

  const admin = supabaseAdmin();

  // Allow removal if the caller is the set owner or was the one who created the invite
  const { data: set } = await admin
    .from("sets")
    .select("owner_user_id")
    .eq("id", setId)
    .maybeSingle();

  const isOwner = (set as any)?.owner_user_id === user.id;

  if (isOwner) {
    await admin.from("set_collaborators").delete()
      .eq("id", inviteId);
    return NextResponse.json({ ok: true });
  }

  // Co-owners can remove other collaborators, but not fellow co-owners.
  const { data: callerCollab } = await admin
    .from("set_collaborators")
    .select("id")
    .eq("set_id", setId)
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .eq("role", "co-owner")
    .maybeSingle();

  if (callerCollab) {
    const { data: target } = await admin
      .from("set_collaborators")
      .select("role")
      .eq("id", inviteId)
      .eq("set_id", setId)
      .maybeSingle();
    if ((target as any)?.role === "co-owner") {
      return NextResponse.json({ error: "Only the set owner can remove a co-owner" }, { status: 403 });
    }
    await admin.from("set_collaborators").delete()
      .eq("id", inviteId)
      .eq("set_id", setId);
    return NextResponse.json({ ok: true });
  }

  // Other non-owners can only cancel their own pending (unclaimed) invites.
  await admin.from("set_collaborators").delete()
    .eq("id", inviteId)
    .eq("invited_by", user.id)
    .is("user_id", null);

  return NextResponse.json({ ok: true });
}
