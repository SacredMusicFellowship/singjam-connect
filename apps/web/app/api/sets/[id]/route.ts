import { NextResponse } from "next/server";
import { webUrl } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiUser } from "@/lib/supabase/apiUser";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  // Owner and co-owners can edit the set (rename, visibility, playlists).
  const [ownerRes, coOwnerRes] = await Promise.all([
    admin.from("sets").select("id").eq("id", id).eq("owner_user_id", user.id).maybeSingle(),
    admin.from("set_collaborators").select("id").eq("set_id", id).eq("user_id", user.id).eq("status", "accepted").eq("role", "co-owner").maybeSingle(),
  ]);
  if (!ownerRes.data && !coOwnerRes.data) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, link_sharing, ultimate_guitar_playlist_url } = body;

  if (link_sharing !== undefined) {
    if (!["private", "link", "public"].includes(link_sharing)) {
      return NextResponse.json({ error: "Invalid link_sharing value" }, { status: 400 });
    }
    const { error } = await admin
      .from("sets")
      .update({ link_sharing, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (ultimate_guitar_playlist_url !== undefined) {
    const url = typeof ultimate_guitar_playlist_url === "string" ? webUrl(ultimate_guitar_playlist_url) : null;
    if (ultimate_guitar_playlist_url && !url) {
      return NextResponse.json({ error: "Enter a web address starting with https://" }, { status: 400 });
    }
    const { error } = await admin
      .from("sets")
      .update({ ultimate_guitar_playlist_url: url, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, ultimate_guitar_playlist_url: url });
  }

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { error } = await admin
    .from("sets")
    .update({ name: name.trim(), description: description?.trim() || null, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Deleting a set stays owner-only (co-owners cannot delete).
  const { error } = await supabaseAdmin()
    .from("sets")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
