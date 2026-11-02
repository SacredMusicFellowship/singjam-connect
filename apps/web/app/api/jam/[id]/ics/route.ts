import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildIcs } from "@/lib/ics";

// Linked from emails, so there's usually no session. A public jam's full
// address goes only to someone attending, proven by their RSVP's id, which the
// confirmation email puts in the link; anyone else gets the neighbourhood, as
// on the page (jam_full_address, migrations 173-174).
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jamId } = await params;
  const rsvpId = new URL(req.url).searchParams.get("rsvp");

  const admin = supabaseAdmin();

  const { data: jam } = await admin
    .from("jams")
    .select("name, starts_at, ends_at, full_address, neighborhood, visibility")
    .eq("id", jamId)
    .single();

  if (!jam || !jam.starts_at) {
    return new Response("Not found", { status: 404 });
  }

  let showFullAddress = jam.visibility === "official" || jam.visibility === "private";
  if (!showFullAddress && rsvpId && /^[0-9a-f-]{36}$/i.test(rsvpId)) {
    const { data: rsvp } = await admin
      .from("jam_rsvps")
      .select("id")
      .eq("id", rsvpId)
      .eq("jam_id", jamId)
      .eq("status", "attending")
      .maybeSingle();
    showFullAddress = !!rsvp;
  }

  const location = (showFullAddress ? jam.full_address : null) ?? jam.neighborhood ?? null;
  const ics = buildIcs({
    uid: `jam-${jamId}@singjam`,
    title: jam.name ?? "SingJam",
    startsAt: jam.starts_at,
    endsAt: jam.ends_at ?? null,
    location,
    description: location ? `Location: ${location}` : null,
  });

  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="singjam-${jamId}.ics"`,
    },
  });
}
