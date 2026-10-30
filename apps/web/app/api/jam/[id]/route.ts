import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canEditJamById } from "@/lib/jamAuthz";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { createNotification } from "@/lib/notifications";
import { FROM_ADDRESS } from "@/lib/resend";
import { sendBulkEmail } from "@/lib/sendBulkEmail";
import { jamCancelledHtml } from "@/emails/jam-cancelled";
import { jamUpdatedHtml } from "@/emails/jam-updated";
import { buildIcs } from "@/lib/ics";
import { isValidTimeZone } from "@singjam/core";
import { devRefusesVisibility, DEV_PRIVATE_JAMS_MESSAGE } from "@/lib/devSafety";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    // Native app authenticates with a bearer token instead of cookies
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: currentJam } = await admin
    .from("jams")
    .select("host_user_id, name, starts_at, ends_at, neighborhood, full_address, timezone, visibility")
    .eq("id", id)
    .maybeSingle();

  if (!currentJam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The host, or for an official event anyone who can host one. Co-hosts help
  // run a jam but cannot change or cancel it. See lib/jamAuthz.ts.
  if (!(await canEditJamById(admin, id, user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const {
    name, starts_at, ends_at, neighborhood, full_address, notes, visibility,
    guests_can_invite, tickets_url, image_url, image_focal_point, capacity,
    genre_ids, theme_ids,
  } = body;
  // The client converts the typed times using the venue's zone (from /api/timezone),
  // so store that same zone; anything unusable keeps the event's existing one.
  const timezone = isValidTimeZone(body.timezone) ? body.timezone : currentJam.timezone;

  if (devRefusesVisibility(currentJam.visibility, visibility)) {
    return NextResponse.json({ error: DEV_PRIVATE_JAMS_MESSAGE }, { status: 403 });
  }

  // The admin client skips the trigger that guards publishing official events
  // (migration 156 lets service_role through), so apply the same rule here.
  if (visibility === "official" && currentJam.visibility !== "official") {
    const { data: profile } = await admin.from("profiles").select("role, can_host_official").eq("id", user.id).maybeSingle();
    if ((profile as any)?.role !== "admin" && !(profile as any)?.can_host_official) {
      return NextResponse.json({ error: "Only official hosts can make an event official" }, { status: 403 });
    }
  }

  const { error: updateError } = await admin.from("jams").update({
    name, starts_at, ends_at, neighborhood, full_address, notes, visibility,
    guests_can_invite: visibility !== "official" ? guests_can_invite : false,
    tickets_url: visibility === "official" ? tickets_url : null,
    image_url, image_focal_point, capacity, timezone,
  }).eq("id", id);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  await Promise.all([
    admin.from("jam_genres").delete().eq("jam_id", id),
    admin.from("jam_themes").delete().eq("jam_id", id),
  ]);
  await Promise.all([
    genre_ids?.length > 0 ? admin.from("jam_genres").insert(genre_ids.map((genre_id: string) => ({ jam_id: id, genre_id }))) : Promise.resolve(),
    theme_ids?.length > 0 ? admin.from("jam_themes").insert(theme_ids.map((theme_id: string) => ({ jam_id: id, theme_id }))) : Promise.resolve(),
  ]);

  // Postgres returns "+00:00" while clients send toISOString()'s ".000Z", so compare instants, not strings.
  const sameInstant = (a: string | null, b: string | null) => (a && b ? Date.parse(a) === Date.parse(b) : a === b);
  const timeChanged = !sameInstant(currentJam.starts_at, starts_at) || !sameInstant(currentJam.ends_at, ends_at);
  const locationChanged = currentJam.neighborhood !== neighborhood || currentJam.full_address !== full_address;

  if (!timeChanged && !locationChanged) return NextResponse.json({ ok: true });

  const [{ data: rsvps }, { data: invites }] = await Promise.all([
    admin.from("jam_rsvps").select("user_id").eq("jam_id", id).in("status", ["attending", "waitlist"]),
    admin.from("jam_invites").select("invited_user_id, invitee_email").eq("jam_id", id).in("status", ["pending", "accepted"]),
  ]);

  const memberIds: string[] = [
    ...(rsvps ?? []).map((r: any) => r.user_id),
    ...(invites ?? []).map((i: any) => i.invited_user_id).filter(Boolean),
  ].filter((uid: string) => uid !== user.id);

  const nonMemberEmails: string[] = (invites ?? [])
    .filter((i: any) => !i.invited_user_id && i.invitee_email)
    .map((i: any) => i.invitee_email);

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";
  const jamUrl = `${siteUrl}/jam/${id}`;
  const jamName = name ?? currentJam.name;
  const newLocation = full_address || neighborhood || null;
  const sequence = Math.floor(Date.now() / 1000);

  const icsContent = buildIcs(
    { uid: `jam-${id}@singjam`, title: jamName ?? "SingJam event", startsAt: starts_at, endsAt: ends_at, location: newLocation, description: notes, sequence },
    "REQUEST"
  );
  const icsAttachment = [{ filename: "event-update.ics", content: Buffer.from(icsContent) }];

  const uniqueMemberIds = [...new Set(memberIds)];
  const { data: profiles } = await admin.from("profiles").select("id, display_name, username").in("id", uniqueMemberIds);
  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const memberEmails = await Promise.all(
    uniqueMemberIds.map(async (uid: string) => {
      const profile = profileMap.get(uid);
      const [{ data: authData }] = await Promise.all([
        admin.auth.admin.getUserById(uid),
        createNotification({ userId: uid, type: "jam_updated", title: `${jamName ?? "A jam"} has been updated`, link: `/jam/${id}` }).catch(() => {}),
      ]);
      return { email: authData.user?.email, name: profile?.display_name ?? profile?.username ?? null };
    })
  );

  await sendBulkEmail([
    ...memberEmails
      .filter((m) => m.email)
      .map((m) => ({
        from: FROM_ADDRESS,
        to: m.email!,
        subject: `Update: ${jamName ?? "A jam you're attending"}`,
        html: jamUpdatedHtml({ name: m.name, jamName, jamUrl, timeChanged, locationChanged, newStartsAt: starts_at, newLocation, timezone }),
        attachments: icsAttachment,
      })),
    ...nonMemberEmails.map((email: string) => ({
      from: FROM_ADDRESS,
      to: email,
      subject: `Update: ${jamName ?? "A jam you're invited to"}`,
      html: jamUpdatedHtml({ name: null, jamName, jamUrl, timeChanged, locationChanged, newStartsAt: starts_at, newLocation, timezone }),
      attachments: icsAttachment,
    })),
  ]);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    // Native app authenticates with a bearer token instead of cookies
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();

  const { data: jam } = await admin
    .from("jams")
    .select("host_user_id, name, starts_at, timezone")
    .eq("id", id)
    .maybeSingle();

  if (!jam) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // The host, or for an official event anyone who can host one. Co-hosts help
  // run a jam but cannot change or cancel it. See lib/jamAuthz.ts.
  if (!(await canEditJamById(admin, id, user.id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Fetch all attendees and waitlisted users before deleting
  const { data: rsvps } = await admin
    .from("jam_rsvps")
    .select("user_id")
    .eq("jam_id", id)
    .in("status", ["attending", "waitlist"]);

  const attendeeIds = (rsvps ?? []).map((r: any) => r.user_id).filter((uid: string) => uid !== user.id);

  // Through the admin client: RLS only lets the creator delete, so an official
  // host's cancel would otherwise remove nothing yet still email everyone.
  const { error: deleteError } = await admin.from("jams").delete().eq("id", id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  // Notify attendees + host in parallel — fire and forget errors
  const allNotifyIds = [...attendeeIds, user.id];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, display_name, username")
    .in("id", allNotifyIds);

  const profileMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));

  const recipients = await Promise.all(allNotifyIds.map(async (uid: string) => {
    const isHost = uid === user.id;
    const profile = profileMap.get(uid);
    const [{ data: authData }] = await Promise.all([
      admin.auth.admin.getUserById(uid),
      isHost ? Promise.resolve() : createNotification({
        userId: uid,
        type: "jam_cancelled",
        title: `${jam.name ?? "A jam you were attending"} has been cancelled`,
      }).catch(() => {}),
    ]);
    return { email: authData.user?.email, name: profile?.display_name ?? profile?.username ?? null, isHost };
  }));

  await sendBulkEmail(
    recipients
      .filter((r) => r.email)
      .map((r) => ({
        from: FROM_ADDRESS,
        to: r.email!,
        subject: `${jam.name ?? "A jam"} has been cancelled`,
        html: jamCancelledHtml({ name: r.name, jamName: jam.name, startsAt: jam.starts_at, timezone: (jam as any).timezone, isHost: r.isHost }),
      }))
  );

  return NextResponse.json({ ok: true });
}
