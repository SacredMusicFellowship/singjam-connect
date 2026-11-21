import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { memberInviteHtml, nonMemberInviteHtml } from "@/emails/jam-invite";
import { formatJamTime } from "@/lib/formatJamTime";
import { isJamCohost } from "@/lib/jamCohosts";
import { jamPathById } from "@/lib/shortRef";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jamId } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { inviteId } = await req.json();
  if (!inviteId) return NextResponse.json({ error: "inviteId is required" }, { status: 400 });

  const admin = supabaseAdmin();

  // Verify caller is the jam host
  const { data: jam } = await admin
    .from("jams")
    .select("host_user_id, name, starts_at, timezone")
    .eq("id", jamId)
    .single();

  if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });
  if (jam.host_user_id !== user.id && !(await isJamCohost(admin, jamId, user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Load the invite
  const { data: invite } = await admin
    .from("jam_invites")
    .select("id, status, invited_user_id, invitee_email, token")
    .eq("id", inviteId)
    .eq("jam_id", jamId)
    .single();

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  if (invite.status !== "pending") return NextResponse.json({ error: "Invite is not pending" }, { status: 400 });

  // Get host name for the nudge email
  const { data: hostProfile } = await admin
    .from("profiles")
    .select("display_name, username")
    .eq("id", user.id)
    .single();
  const hostName = (hostProfile as any)?.display_name ?? (hostProfile as any)?.username ?? "Your host";

  const jamName = jam.name ?? "a jam";
  const startsAt = formatJamTime(jam.starts_at, jam.timezone);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";

  if (invite.invited_user_id) {
    const [{ data: inviteeProfile }, { data: authData }] = await Promise.all([
      admin.from("profiles").select("display_name, username").eq("id", invite.invited_user_id).single(),
      admin.auth.admin.getUserById(invite.invited_user_id),
    ]);

    const email = authData.user?.email;
    if (!email) return NextResponse.json({ error: "No email for invitee" }, { status: 400 });

    const inviteeName = (inviteeProfile as any)?.display_name ?? (inviteeProfile as any)?.username ?? null;
    const jamUrl = `${baseUrl}${await jamPathById(jamId)}?invite=${invite.token}`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `Reminder: ${hostName} invited you to ${jamName}`,
      html: memberInviteHtml({ inviterName: hostName, inviteeName, jamName, startsAt, jamUrl }),
    });
  } else if (invite.invitee_email) {
    const signupUrl = `${baseUrl}${await jamPathById(jamId)}?invite=${invite.token}`;

    await resend.emails.send({
      from: FROM_ADDRESS,
      to: invite.invitee_email,
      subject: `Reminder: ${hostName} invited you to ${jamName}`,
      html: nonMemberInviteHtml({ inviterName: hostName, jamName, startsAt, signupUrl }),
    });
  } else {
    return NextResponse.json({ error: "Invite has no recipient" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
