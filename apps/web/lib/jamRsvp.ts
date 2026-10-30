import type { SupabaseClient } from "@supabase/supabase-js";
import { resend, FROM_ADDRESS } from "@/lib/resend";
import { jamRsvpConfirmedHtml } from "@/emails/jam-rsvp-confirmed";
import { createNotification } from "@/lib/notifications";
import { joinJamSetList } from "@/lib/jamAttendance";
import { jamIsFull, jamSeatExcludedUserId } from "@singjam/core";

export const RSVP_JAM_COLUMNS =
  "id, name, capacity, host_user_id, visibility, starts_at, ends_at, timezone, full_address, neighborhood";

export type RsvpJam = {
  id: string;
  name: string | null;
  capacity: number | null;
  host_user_id: string | null;
  visibility: string | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string | null;
  full_address: string | null;
  neighborhood: string | null;
};

type RsvpResult = { status: "attending" | "waitlist"; waitlistPosition: number | null };

// The one way a member says they're coming, shared by the RSVP button and by
// accepting an invite. Those two used to carry their own copies, and both
// announced the RSVP to the host on every call rather than on a change — so an
// invitee who accepted and then pressed RSVP (the page still offered it) sent
// the host two "is going to" notifications. Accepting also never sent the
// confirmation email the button did.
//
// The confirmation email and the host notification fire only when this call is
// the one that moved the person into attending or the waitlist. Asking again
// returns where they already stand and announces nothing.
export async function rsvpToJam(
  admin: SupabaseClient,
  jam: RsvpJam,
  userId: string,
): Promise<RsvpResult> {
  const existing = await readRsvp(admin, jam.id, userId);
  if (existing?.status === "attending" || existing?.status === "waitlist") {
    if (existing.status === "attending") await joinJamSetList(admin, jam.id, userId);
    return { status: existing.status, waitlistPosition: existing.waitlist_position ?? null };
  }

  let attendingQuery = admin
    .from("jam_rsvps")
    .select("id", { count: "exact", head: true })
    .eq("jam_id", jam.id)
    .eq("status", "attending");
  const excludedUserId = jamSeatExcludedUserId(jam);
  if (excludedUserId) attendingQuery = attendingQuery.neq("user_id", excludedUserId);
  const { count: attendingCount } = await attendingQuery;
  const isFull = jamIsFull(jam, attendingCount ?? 0);

  let waitlistPosition: number | null = null;
  if (isFull) {
    const { count: waitlistCount } = await admin
      .from("jam_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("jam_id", jam.id)
      .eq("status", "waitlist");
    waitlistPosition = (waitlistCount ?? 0) + 1;
  }
  const status = isFull ? "waitlist" : "attending";

  // Written conditionally so two overlapping requests can't both count as the
  // change: the update only lands if the row still holds the status we read,
  // and the unique (jam_id, user_id) index turns away a second insert.
  const { data: written } = existing
    ? await admin
        .from("jam_rsvps")
        .update({ status, waitlist_position: waitlistPosition })
        .eq("id", existing.id)
        .eq("status", existing.status)
        .select("id")
    : await admin
        .from("jam_rsvps")
        .insert({ jam_id: jam.id, user_id: userId, status, waitlist_position: waitlistPosition })
        .select("id");

  if (!written?.length) {
    const now = await readRsvp(admin, jam.id, userId);
    if (now?.status === "attending" || now?.status === "waitlist") {
      return { status: now.status, waitlistPosition: now.waitlist_position ?? null };
    }
    throw new Error(`RSVP write for jam ${jam.id} did not land`);
  }

  if (status === "attending") await joinJamSetList(admin, jam.id, userId);

  const [{ data: profile }, { data: authData }] = await Promise.all([
    admin.from("profiles").select("display_name, username").eq("id", userId).maybeSingle(),
    status === "attending" ? admin.auth.admin.getUserById(userId) : Promise.resolve({ data: null }),
  ]);
  const name = (profile as any)?.display_name ?? (profile as any)?.username ?? null;

  const email = (authData as any)?.user?.email;
  if (email) {
    await resend.emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: `You're going to ${jam.name ?? "the jam"}!`,
      html: jamRsvpConfirmedHtml({
        name,
        jamName: jam.name ?? "the jam",
        jamId: jam.id,
        jamUrl: `https://singjam.org/jam/${jam.id}`,
        startsAt: jam.starts_at,
        endsAt: jam.ends_at ?? null,
        timezone: jam.timezone,
        address: jam.full_address ?? jam.neighborhood ?? null,
      }),
    });
  }

  if (jam.host_user_id && jam.host_user_id !== userId) {
    await createNotification({
      userId: jam.host_user_id,
      type: "jam_rsvp",
      title: `${name ?? "Someone"} is ${status === "waitlist" ? "on the waitlist for" : "going to"} ${jam.name ?? "your jam"}`,
      link: `/jam/${jam.id}`,
    });
  }

  return { status, waitlistPosition };
}

async function readRsvp(admin: SupabaseClient, jamId: string, userId: string) {
  const { data } = await admin
    .from("jam_rsvps")
    .select("id, status, waitlist_position")
    .eq("jam_id", jamId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; status: string; waitlist_position: number | null } | null;
}
