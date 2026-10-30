import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { jamWaitlistPromotedHtml } from "@/emails/jam-waitlist-promoted";
import { rsvpToJam, RSVP_JAM_COLUMNS } from "@/lib/jamRsvp";
import { jamPath } from "@singjam/core";

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

  const admin = supabaseAdmin();

  const { data: jam } = await admin.from("jams").select(RSVP_JAM_COLUMNS).eq("id", jamId).single();
  if (!jam) return NextResponse.json({ error: "Jam not found" }, { status: 404 });
  if (jam.visibility === "official") return NextResponse.json({ error: "Official events use external ticketing" }, { status: 400 });

  const { status, waitlistPosition } = await rsvpToJam(admin, jam, user.id);

  return NextResponse.json({ status, waitlist_position: waitlistPosition });
}

export async function DELETE(
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

  const admin = supabaseAdmin();

  const { data: rsvp } = await admin
    .from("jam_rsvps")
    .select("id, status")
    .eq("jam_id", jamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!rsvp) return NextResponse.json({ error: "RSVP not found" }, { status: 404 });

  await admin.from("jam_rsvps").update({ status: "cancelled", waitlist_position: null }).eq("id", rsvp.id);
  await admin.from("jam_cohosts").delete().eq("jam_id", jamId).eq("user_id", user.id);

  // Promote first waitlist person if a confirmed spot opened up
  if (rsvp.status === "attending") {
    const { data: next } = await admin
      .from("jam_rsvps")
      .select("id, user_id")
      .eq("jam_id", jamId)
      .eq("status", "waitlist")
      .order("waitlist_position", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) {
      await admin.from("jam_rsvps").update({ status: "attending", waitlist_position: null }).eq("id", next.id);

      // Get their email and name for notification
      const [{ data: profile }, { data: authData }, { data: jam }] = await Promise.all([
        admin.from("profiles").select("display_name, username").eq("id", next.user_id).single(),
        admin.auth.admin.getUserById(next.user_id),
        admin.from("jams").select("name, short_code, starts_at, timezone").eq("id", jamId).single(),
      ]);

      const email = authData.user?.email;
      if (email) {
        await resend.emails.send({
          from: FROM_ADDRESS,
          to: email,
          subject: `You're in! A spot opened up at ${jam?.name ?? "the jam"}`,
          html: jamWaitlistPromotedHtml({
            name: (profile as any)?.display_name ?? (profile as any)?.username,
            jamName: jam?.name,
            jamUrl: `https://singjam.org${jamPath({ id: jamId, short_code: (jam as any)?.short_code })}`,
            startsAt: jam?.starts_at,
            timezone: (jam as any)?.timezone,
          }),
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
