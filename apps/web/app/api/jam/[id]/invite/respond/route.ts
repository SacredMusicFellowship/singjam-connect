import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { createNotification } from "@/lib/notifications";
import { rsvpToJam, RSVP_JAM_COLUMNS } from "@/lib/jamRsvp";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jamId } = await params;
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    // Native app authenticates with a bearer token instead of cookies
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { response } = await req.json(); // "accepted" | "declined"
  if (!["accepted", "declined"].includes(response)) {
    return NextResponse.json({ error: "Invalid response" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data: invite } = await admin
    .from("jam_invites")
    .select("id, status, invited_by")
    .eq("jam_id", jamId)
    .eq("invited_user_id", user.id)
    .maybeSingle();

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  // Answering the same way twice changes nothing, so it tells nobody anything.
  // Conditional so two overlapping answers can't both count as the change.
  const { data: changed } = await admin
    .from("jam_invites")
    .update({ status: response })
    .eq("id", invite.id)
    .neq("status", response)
    .select("id");
  const alreadyAnswered = !changed?.length;
  let rsvpStatus: "attending" | "waitlist" | null = null;

  if (response === "accepted") {
    const { data: jam } = await admin.from("jams").select(RSVP_JAM_COLUMNS).eq("id", jamId).single();
    if (jam?.host_user_id === user.id) {
      return NextResponse.json({ error: "You can't RSVP to your own jam" }, { status: 400 });
    }
    if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });

    // Tells the host, and sends the confirmation email, only on a real change.
    ({ status: rsvpStatus } = await rsvpToJam(admin, jam, user.id));

    // The host already heard through the RSVP, so only a separate inviter is told here.
    if (!alreadyAnswered && invite.invited_by && invite.invited_by !== jam.host_user_id) {
      const { data: profile } = await admin.from("profiles").select("display_name, username").eq("id", user.id).single();
      const accepterName = (profile as any)?.display_name ?? (profile as any)?.username ?? "Someone";
      await createNotification({
        userId: invite.invited_by,
        type: "invite_accepted",
        title: `${accepterName} accepted your invite to ${jam.name ?? "your jam"}`,
        link: `/jam/${jamId}`,
      });
    }
  }

  if (response === "declined" && !alreadyAnswered && invite.invited_by) {
    const [{ data: profile }, { data: jam }] = await Promise.all([
      admin.from("profiles").select("display_name, username").eq("id", user.id).single(),
      admin.from("jams").select("name").eq("id", jamId).single(),
    ]);
    const declinerName = (profile as any)?.display_name ?? (profile as any)?.username ?? "Someone";
    await createNotification({
      userId: invite.invited_by,
      type: "invite_declined",
      title: `${declinerName} declined your invite to ${(jam as any)?.name ?? "your jam"}`,
      link: `/jam/${jamId}`,
    });
  }

  return NextResponse.json({ ok: true, rsvpStatus });
}
