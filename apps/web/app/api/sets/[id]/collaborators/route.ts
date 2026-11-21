import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiUser } from "@/lib/supabase/apiUser";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { createNotification } from "@/lib/notifications";
import { setAccessGrantedHtml } from "@/emails/set-access-granted";
import { setPathById } from "@/lib/shortRef";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const user = await resolveApiUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { collaboratorId, role } = await req.json();
  if (!collaboratorId || !role) {
    return NextResponse.json({ error: "Missing collaboratorId or role" }, { status: 400 });
  }
  if (role !== "editor" && role !== "viewer" && role !== "co-owner") {
    return NextResponse.json({ error: "role must be editor, viewer, or co-owner" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: set } = await admin
    .from("sets")
    .select("owner_user_id")
    .eq("id", setId)
    .maybeSingle();
  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  const isOwner = (set as any).owner_user_id === user.id;

  const { data: existing } = await admin
    .from("set_collaborators")
    .select("user_id, status, role")
    .eq("id", collaboratorId)
    .eq("set_id", setId)
    .maybeSingle();

  // Owner and co-owners can manage collaborator roles, but only the owner may
  // grant the co-owner role or change an existing co-owner.
  if (!isOwner) {
    const { data: callerCollab } = await admin
      .from("set_collaborators")
      .select("id")
      .eq("set_id", setId)
      .eq("user_id", user.id)
      .eq("status", "accepted")
      .eq("role", "co-owner")
      .maybeSingle();
    if (!callerCollab) {
      return NextResponse.json({ error: "Only the set owner or co-owners can change roles" }, { status: 403 });
    }
    if (role === "co-owner" || (existing as any)?.role === "co-owner") {
      return NextResponse.json({ error: "Only the set owner can assign or change co-owners" }, { status: 403 });
    }
  }

  const { error } = await admin
    .from("set_collaborators")
    .update({ role, status: "accepted" })
    .eq("id", collaboratorId)
    .eq("set_id", setId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify requester only when approving a pending request (not a role change on an existing collaborator)
  if (existing?.user_id && (existing as any).status !== "accepted") {
    const { data: setData } = await admin
      .from("sets")
      .select("name")
      .eq("id", setId)
      .maybeSingle();

    const setName = (setData as any)?.name ?? "a set list";
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";
    const setUrl = `${baseUrl}${await setPathById(setId)}`;

    await createNotification({
      userId: existing.user_id,
      type: "set_access_granted",
      title: `You've been granted access to "${setName}"`,
      link: `/set/${setId}`,
    });

    const { data: requesterAuth } = await admin.auth.admin.getUserById(existing.user_id);
    const requesterEmail = requesterAuth.user?.email;
    if (requesterEmail) {
      await resend.emails.send({
        from: FROM_ADDRESS,
        to: requesterEmail,
        subject: `You've been granted access to "${setName}"`,
        html: setAccessGrantedHtml({ setName, setUrl }),
      });
    }
  }

  return NextResponse.json({ ok: true });
}
