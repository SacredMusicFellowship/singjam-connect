import type { Metadata } from "next";
import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerSupabase, getServerUser } from "@/lib/supabase/cached";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { claimJamInvite } from "@/lib/claimJamInvite";
import { canManageJam, canEditJamById } from "@/lib/jamAuthz";
import { guestTicketBuyers } from "@/lib/jamGuestBuyers";
import { resolveJamId } from "@/lib/shortRef";
import { describeLeaders, jamLeaderRows, publicLeaders } from "@/lib/jamLeaders";
import JamView, { type InviteEntry } from "@/components/JamView";
import ShortUrl from "@/components/ShortUrl";
import { formatJamLongDate, formatJamTimeRange, jamPreviewPlace, jamTags, jamSeatExcludedUserId, jamSeatsTaken } from "@singjam/core";
import { type JamCardData } from "@/components/JamCard";

// Private jams are unlisted, not access-controlled (migration 160): holding
// the link is what grants a view, so the jam itself is read with the admin
// client. Listings stay RLS-scoped, which is what keeps them undiscoverable.
const getJam = cache(async (id: string) => {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("jams")
    .select("id, short_code, name, visibility, starts_at, ends_at, timezone, neighborhood, full_address, notes, tickets_url, image_url, image_focal_point, image_desktop_url, image_mobile_url, image_list_url, capacity, host_user_id, guests_can_invite, profiles(display_name, last_name, username)")
    .eq("id", id)
    .maybeSingle();
  return data as any;
});

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}): Promise<Metadata> {
  const id = await resolveJamId((await params).id);
  const jam = id ? await getJam(id) : null;
  if (!jam) return { title: "Jam" };
  const name = jam.name ?? "Jam";
  // Official events are the org's, so a shared link credits SingJam rather
  // than whoever created the row.
  const host =
    jam.visibility === "official"
      ? "SingJam"
      : jam.profiles?.display_name ?? jam.profiles?.username ?? null;
  // The date, time and place always lead, so a preview that crops or skips the
  // image still says when and where.
  const date = formatJamLongDate(jam.starts_at, jam.timezone);
  const time = formatJamTimeRange(jam.starts_at, jam.ends_at, jam.timezone);
  const place = jamPreviewPlace(jam);
  const parts = [date && time ? `${date}, ${time}` : date, place, host ? `Hosted by ${host}` : null].filter(Boolean);
  const description = parts.length
    ? `${parts.join(" · ")}. RSVP and jam together on SingJam.`
    : "An upcoming jam on SingJam. RSVP and join the music.";
  return {
    title: name,
    description,
    alternates: { canonical: `/jam/${jam.short_code}` },
    openGraph: { title: name, description, url: `/jam/${jam.short_code}` },
  };
}

export default async function JamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ invite?: string }>;
}) {
  const [id, user, { invite }] = await Promise.all([resolveJamId((await params).id), getServerUser(), searchParams]);
  if (!id) return <p className="text-sm text-zinc-500">Jam not found.</p>;

  const supabase = await getServerSupabase();
  const admin = supabaseAdmin();

  // Record the guest against the host's invite before reading their own rows
  // below, so the accept/decline banner is right on the first paint.
  if (invite && user) await claimJamInvite(invite, user.id);

  const userId = user?.id ?? null;

  // The database is a cross-country round trip from the server, so every read
  // below starts at once; reads that depend on another chain off its promise
  // instead of waiting for the whole batch.
  //
  // Jam-scoped reads go through the admin client for the same reason getJam
  // does: the link is the credential. The per-user reads stay RLS-scoped.
  // The street address is the one jam field that isn't the link's to give: a
  // public jam shows it only to people who've RSVP'd. jam_full_address
  // (migration 173) decides, as this viewer, so it never reaches the page —
  // or its serialized props — for anyone else.
  const jamPromise = getJam(id);
  const leaderRowsPromise = jamLeaderRows(admin, id);
  const accessPromise: Promise<[boolean, boolean]> = userId
    ? Promise.all([canManageJam(admin, id, userId), canEditJamById(admin, id, userId)])
    : Promise.resolve([false, false]);

  const [
    jam, tagsRes, flagRes, tierRes, addressRes,
    attendingCount, rsvpRes, inviteRes, cohostRes, [canManage, canEdit], allLeaders, managed,
  ] = await Promise.all([
    jamPromise,
    admin.from("jam_tags").select("tags(name, type)").eq("jam_id", id),
    supabase.from("feature_flags").select("enabled").eq("key", "jam_invites").maybeSingle(),
    // Only whether tiers exist, not their availability — the purchase panel
    // reads that itself. The layout needs the answer on the server: the panel
    // renders nothing for an event selling through tickets_url, and the map
    // sits beside it only when there is something for it to sit beside.
    admin.from("ticket_types").select("id", { count: "exact", head: true }).eq("jam_id", id),
    supabase.rpc("jam_full_address", { jam_id_param: id }),
    jamPromise.then(async (j) => {
      if (!j) return 0;
      // Excludes the host, whose seat jamSeatsTaken adds back exactly once — a
      // host with a stray RSVP row of their own must not be counted twice. On an
      // official event nobody is excluded: the creator's RSVP is an ordinary one.
      const excludedUserId = jamSeatExcludedUserId(j);
      let q = admin
        .from("jam_rsvps")
        .select("id", { count: "exact", head: true })
        .eq("jam_id", id)
        .eq("status", "attending");
      if (excludedUserId) q = q.neq("user_id", excludedUserId);
      return (await q).count ?? 0;
    }),
    userId
      ? supabase.from("jam_rsvps").select("status, waitlist_position").eq("jam_id", id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? supabase.from("jam_invites").select("status").eq("jam_id", id).eq("invited_user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    userId
      ? supabase.from("jam_cohosts").select("user_id").eq("jam_id", id).eq("user_id", userId).maybeSingle()
      : Promise.resolve({ data: null }),
    // Distinct from isHost: someone who can host official events may run any of
    // them without being this one's host. isHost stays literal — it drives the
    // co-host controls and whether the RSVP button is offered.
    accessPromise,
    // Music leaders are an official-event feature (migration 172).
    Promise.all([jamPromise, leaderRowsPromise]).then(([j, rows]) =>
      describeLeaders(admin, j?.visibility === "official" ? rows : [])
    ),
    accessPromise.then(([manage]) => (manage ? managerData(admin, supabase, id, userId!) : null)),
  ]);

  if (!jam) return <p className="text-sm text-zinc-500">Jam not found.</p>;

  const genres = jamTags(tagsRes.data as any, "genre").map((t) => t.name);
  const themes = jamTags(tagsRes.data as any).filter((t) => t.type !== "genre").map((t) => t.name);
  const invitesEnabled = flagRes.data?.enabled ?? true;

  const hostLabel = [jam.profiles?.display_name, jam.profiles?.last_name].filter(Boolean).join(" ") || jam.profiles?.username || null;
  const hostUsername = jam.profiles?.username ?? null;
  const rsvpStatus = ((rsvpRes.data as any)?.status as "attending" | "waitlist" | "cancelled" | undefined) ?? null;
  const waitlistPosition = (rsvpRes.data as any)?.waitlist_position ?? null;
  const pendingInvite = (inviteRes.data as any)?.status === "pending";

  const isOfficial = jam.visibility === "official";
  const isAttending = rsvpStatus === "attending";
  const isHost = jam.host_user_id === userId;
  const isCoHost = !!cohostRes.data;
  const hasFullAccess = isOfficial || isAttending || canManage;

  const leaderRows = isOfficial ? await leaderRowsPromise : [];
  const myLeaderRow = userId ? leaderRows.find((r) => r.user_id === userId) : undefined;
  const showRsvp = !isOfficial && !!userId && !pendingInvite && !isHost;
  const canInvite = !!userId && !isOfficial && (canManage || (isAttending && jam.guests_can_invite));

  const inviteList: InviteEntry[] = managed?.inviteList ?? [];
  const guestBuyerCount = managed?.guestBuyerCount ?? 0;
  const alreadyInvitedIds: string[] = managed?.alreadyInvitedIds ?? [];
  // "Message attendees" goes to everyone attending except whoever sends it, so
  // its count is its own — not the capacity count, which leaves out the host.
  const messageRecipientCount = managed?.messageRecipientCount ?? 0;

  const jamCardData: JamCardData = {
    id: jam.id,
    name: jam.name,
    visibility: jam.visibility,
    starts_at: jam.starts_at,
    ends_at: jam.ends_at,
    timezone: jam.timezone,
    neighborhood: jam.neighborhood,
    full_address: (addressRes.data as string | null) ?? null,
    notes: jam.notes,
    tickets_url: jam.tickets_url,
    image_url: jam.image_url,
    image_focal_point: jam.image_focal_point,
    image_desktop_url: jam.image_desktop_url,
    image_mobile_url: jam.image_mobile_url,
    image_list_url: jam.image_list_url,
    genres,
    themes,
    host: hostLabel,
    hostUsername,
    capacity: jam.capacity,
  };

  // JamView seeds its RSVP state from these props once. Accepting an invite
  // refreshes the page rather than reporting back, so without the key the view
  // kept its pre-accept status and offered the new attendee an RSVP button.
  return (
    <>
    <ShortUrl base="jam" id={id} shortCode={jam.short_code} />
    <JamView
      key={rsvpStatus ?? "none"}
      jamId={id}
      data={{
        jam: { name: jam.name, capacity: jam.capacity, host_user_id: jam.host_user_id },
        jamCardData,
        shortCode: jam.short_code,
        userId,
        rsvpStatus,
        waitlistPosition,
        attendingCount,
        seatsTaken: jamSeatsTaken(jam, attendingCount),
        messageRecipientCount,
        guestBuyerCount,
        pendingInvite,
        isOfficial,
        hasTicketTiers: (tierRes.count ?? 0) > 0,
        isHost,
        isCoHost,
        hasFullAccess,
        canManage,
        canEdit,
        showRsvp,
        canInvite,
        invitesEnabled,
        inviteList,
        alreadyInvitedIds,
        leaders: publicLeaders(allLeaders),
        myLeader: myLeaderRow
          ? { userId: myLeaderRow.user_id!, token: myLeaderRow.token, hasLeaderTicket: !!myLeaderRow.order_id }
          : null,
        managedLeaders: canManage && isOfficial ? allLeaders : null,
      }}
    />
    </>
  );
}

// What only a jam's managers see: the invite list and the message-attendees count.
async function managerData(admin: SupabaseClient, supabase: SupabaseClient, id: string, userId: string) {
  const [buyers, { count: othersAttending }, { data: rawInvites }] = await Promise.all([
    guestTicketBuyers(admin, id),
    admin
      .from("jam_rsvps")
      .select("id", { count: "exact", head: true })
      .eq("jam_id", id)
      .eq("status", "attending")
      .neq("user_id", userId),
    supabase
      .from("jam_invites")
      .select("id, invited_user_id, invitee_email, status")
      .eq("jam_id", id)
      .order("created_at", { ascending: true }),
  ]);
  const guestBuyerCount = buyers.size;
  const messageRecipientCount = (othersAttending ?? 0) + guestBuyerCount;
  const invites = (rawInvites ?? []) as any[];
  const memberIds = invites.map((i: any) => i.invited_user_id).filter(Boolean);
  const profileMap = new Map<string, any>();
  if (memberIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name, last_name, username")
      .in("id", memberIds);
    for (const p of (profiles ?? []) as any[]) profileMap.set(p.id, p);
  }
  const inviteList: InviteEntry[] = invites
    .filter((inv: any) => inv.status !== "accepted" && (inv.invited_user_id || inv.invitee_email))
    .map((inv: any) => ({
      invited_user_id: inv.invited_user_id,
      invitee_email: inv.invitee_email,
      status: inv.status,
      ...(inv.invited_user_id ? profileMap.get(inv.invited_user_id) : {}),
      id: inv.id,
    }));
  return { guestBuyerCount, messageRecipientCount, alreadyInvitedIds: memberIds as string[], inviteList };
}
