import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { createNotification } from "@/lib/notifications";
import { setAccessRequestHtml } from "@/emails/set-access-request";
import { setPathById } from "@/lib/shortRef";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: setId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: set } = await admin
    .from("sets")
    .select("id, name, owner_user_id")
    .eq("id", setId)
    .maybeSingle();
  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  if ((set as any).owner_user_id === user.id) {
    return NextResponse.json({ error: "You already own this set" }, { status: 400 });
  }

  const { data: existingCollab } = await admin
    .from("set_collaborators")
    .select("id")
    .eq("set_id", setId)
    .eq("user_id", user.id)
    .eq("status", "accepted")
    .maybeSingle();
  if (existingCollab) return NextResponse.json({ error: "Already a collaborator" }, { status: 400 });

  const { error: insertError } = await admin
    .from("set_collaborators")
    .insert({ set_id: setId, user_id: user.id, status: "requested" });

  if (insertError) {
    // Unique index violation means they already requested
    if (insertError.code === "23505") {
      return NextResponse.json({ error: "Already requested" }, { status: 409 });
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const { data: requesterProfile } = await admin
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .single();
  const requesterName = (requesterProfile as any)?.display_name ?? (requesterProfile as any)?.username ?? "Someone";

  const setName = (set as any).name;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";
  const setUrl = `${baseUrl}${await setPathById(setId)}`;
  const ownerId = (set as any).owner_user_id;

  await createNotification({
    userId: ownerId,
    type: "set_access_request",
    title: `${requesterName} wants access to "${setName}"`,
    link: `/set/${setId}`,
  });

  const { data: ownerAuth } = await admin.auth.admin.getUserById(ownerId);
  const ownerEmail = ownerAuth.user?.email;
  if (ownerEmail) {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: ownerEmail,
      subject: `${requesterName} wants access to "${setName}"`,
      html: setAccessRequestHtml({ requesterName, setName, setUrl }),
    });
  }

  return NextResponse.json({ ok: true });
}
