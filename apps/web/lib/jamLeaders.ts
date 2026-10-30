import type { SupabaseClient } from "@supabase/supabase-js";
import { jamPath, setPath } from "@singjam/core";
import { markAttending } from "@/lib/jamAttendance";
import { createNotification } from "@/lib/notifications";
import { findEventSet } from "@/lib/eventSet";
import { sideEffectsBlocked } from "@/lib/devSafety";
import { SITE_URL } from "@/lib/stripe";
import { resend, EVENTS_FROM_ADDRESS } from "@/lib/resend";
import { jamLeaderAddedHtml } from "@/emails/jam-leader-added";
import { fetchAllAuthUsers } from "@/lib/authUsers";

// Music leaders on official events (migration 172). The host adds someone who
// has already agreed to lead, and that is the confirmation: they are emailed a
// comp ticket and seated straight away, with a link to step down if plans
// change. There is no invited/accepted state — a row exists while they lead.

export type JamLeaderRow = {
  id: string;
  jam_id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  show_publicly: boolean;
  token: string;
  order_id: string | null;
  added_by: string | null;
  created_at: string;
};

/** What anyone viewing the event may see. Never carries an email or token. */
export type PublicJamLeader = {
  id: string;
  user_id: string | null;
  name: string;
  username: string | null;
  avatar_url: string | null;
};

/** What the host sees when managing leaders. */
export type ManagedJamLeader = PublicJamLeader & {
  email: string | null;
  show_publicly: boolean;
  /** What they paid for a ticket of their own, when that is their seat instead of a leader ticket. */
  own_ticket_cents: number | null;
};

const LEADER_COLUMNS = "id, jam_id, user_id, name, email, show_publicly, token, order_id, added_by, created_at";

// Dots only separate the domain's parts, so no two parts of the pattern can
// match the same characters and it runs in linear time on any input.
const isEmail = (s: string) => s.length <= 254 && /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(s);

const fullName = (p: any) => [p?.display_name, p?.last_name].filter(Boolean).join(" ") || p?.username || null;

export async function jamLeaderRows(admin: SupabaseClient, jamId: string): Promise<JamLeaderRow[]> {
  const { data } = await admin
    .from("jam_leaders")
    .select(LEADER_COLUMNS)
    .eq("jam_id", jamId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  return (data ?? []) as JamLeaderRow[];
}

export async function leaderByToken(admin: SupabaseClient, token: string): Promise<JamLeaderRow | null> {
  // A malformed token would make Postgres reject the uuid cast; treat it as
  // not found rather than a server error.
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;
  const { data } = await admin.from("jam_leaders").select(LEADER_COLUMNS).eq("token", token).maybeSingle();
  return (data as JamLeaderRow) ?? null;
}

type PurchaseRow = { buyer_user_id: string | null; buyer_email: string | null; amount_cents: number };

// Paid orders bought for this event, the leader ticket aside. These are what
// someone who got their own ticket before (or after) being asked to lead
// comes in on.
async function purchasedOrders(admin: SupabaseClient, jamId: string): Promise<PurchaseRow[]> {
  const { data } = await admin
    .from("ticket_orders")
    .select("buyer_user_id, buyer_email, amount_cents")
    .eq("jam_id", jamId)
    .eq("source", "purchase")
    .eq("status", "paid");
  return (data ?? []) as PurchaseRow[];
}

function ownTicketCents(orders: PurchaseRow[], who: { userId: string | null; email: string | null }): number | null {
  const mine = orders.filter((o) =>
    who.userId
      ? o.buyer_user_id === who.userId
      : !o.buyer_user_id && !!who.email && o.buyer_email?.toLowerCase() === who.email.toLowerCase()
  );
  return mine.length ? mine.reduce((sum, o) => sum + o.amount_cents, 0) : null;
}

// Members are shown by their profile name, so a rename carries through; guests
// by the name the host typed.
export async function describeLeaders(admin: SupabaseClient, rows: JamLeaderRow[]): Promise<ManagedJamLeader[]> {
  const ids = rows.map((r) => r.user_id).filter((v): v is string => !!v);
  const profiles = new Map<string, any>();
  if (ids.length) {
    const { data } = await admin
      .from("profiles")
      .select("id, display_name, last_name, username, avatar_url")
      .in("id", ids);
    for (const p of data ?? []) profiles.set((p as any).id, p);
  }
  const selfTicketed = rows.filter((r) => !r.order_id);
  const orders = selfTicketed.length ? await purchasedOrders(admin, selfTicketed[0].jam_id) : [];
  return rows.map((r) => {
    const p = r.user_id ? profiles.get(r.user_id) : null;
    return {
      id: r.id,
      user_id: r.user_id,
      name: fullName(p) ?? r.name ?? "Leader",
      username: p?.username ?? null,
      avatar_url: p?.avatar_url ?? null,
      email: r.email,
      show_publicly: r.show_publicly,
      own_ticket_cents: r.order_id ? null : ownTicketCents(orders, { userId: r.user_id, email: r.email }),
    };
  });
}

// A leader's free ticket: an order of its own, so it never reads as a sale, and
// no tier, which keeps it outside every stock limit.
async function issueLeaderTicket(
  admin: SupabaseClient,
  jamId: string,
  who: { userId: string | null; name: string | null; email: string | null },
): Promise<{ orderId: string; qrToken: string | null } | null> {
  const now = new Date().toISOString();
  const { data: order } = await admin
    .from("ticket_orders")
    .insert({
      jam_id: jamId,
      buyer_user_id: who.userId,
      buyer_email: who.userId ? null : who.email,
      buyer_name: who.userId ? null : who.name,
      source: "leader",
      status: "paid",
      amount_cents: 0,
      expires_at: now,
      paid_at: now,
    })
    .select("id")
    .single();
  if (!order) return null;

  const { data: ticket } = await admin
    .from("tickets")
    .insert({
      order_id: order.id,
      jam_id: jamId,
      holder_user_id: who.userId,
      holder_name: who.userId ? null : who.name,
      holder_email: who.userId ? null : who.email,
    })
    .select("qr_token")
    .single();
  return { orderId: order.id, qrToken: ticket?.qr_token ?? null };
}

export function publicLeaders(leaders: ManagedJamLeader[]): PublicJamLeader[] {
  return leaders
    .filter((l) => l.show_publicly)
    .map(({ id, user_id, name, username, avatar_url }) => ({ id, user_id, name, username, avatar_url }));
}

type AddInput = { jamId: string; addedBy: string; userId?: string | null; name?: string | null; email?: string | null };
type AddResult = { ok: true; leader: ManagedJamLeader; emailed: boolean } | { ok: false; status: number; error: string };

export async function addJamLeader(admin: SupabaseClient, input: AddInput): Promise<AddResult> {
  const userId = input.userId || null;
  let name = input.name?.trim() || null;
  let email = input.email?.trim().toLowerCase() || null;

  if (!userId) {
    if (!name) return { ok: false, status: 400, error: "A name is required" };
    if (!email || !isEmail(email)) return { ok: false, status: 400, error: "A valid email is required" };
  }

  const { data: jam } = await admin
    .from("jams")
    .select("id, name, short_code, visibility, starts_at, ends_at, timezone, full_address, neighborhood, host_user_id")
    .eq("id", input.jamId)
    .maybeSingle();
  if (!jam) return { ok: false, status: 404, error: "Event not found" };
  if (jam.visibility !== "official") {
    return { ok: false, status: 400, error: "Leaders can only be added to official events" };
  }

  // Someone with an account is always added as a member, even when the host
  // typed their email, so they get the set list and the profile link.
  if (!userId && email) {
    const match = (await fetchAllAuthUsers(admin.auth.admin)).find((u) => u.email?.toLowerCase() === email);
    if (match) return addJamLeader(admin, { ...input, userId: match.id, email: null });
  }

  if (userId) {
    const [{ data: profile }, { data: authData }] = await Promise.all([
      admin.from("profiles").select("display_name, last_name, username").eq("id", userId).maybeSingle(),
      admin.auth.admin.getUserById(userId),
    ]);
    if (!profile) return { ok: false, status: 404, error: "Member not found" };
    name = fullName(profile);
    email = authData.user?.email ?? null;
  }

  const existing = userId
    ? await admin.from("jam_leaders").select("id").eq("jam_id", jam.id).eq("user_id", userId).maybeSingle()
    : await admin.from("jam_leaders").select("id").eq("jam_id", jam.id).is("user_id", null).ilike("email", email!).maybeSingle();
  if (existing.data) return { ok: false, status: 409, error: "Already leading this event" };

  // Someone who already got a ticket comes in on that one. A second, free one
  // would count them twice in Who's going; whether to refund what they paid is
  // the host's call.
  const ownCents = ownTicketCents(await purchasedOrders(admin, jam.id), { userId, email });
  let comp: { orderId: string; qrToken: string | null } | null = null;
  if (ownCents === null) {
    comp = await issueLeaderTicket(admin, jam.id, { userId, name, email });
    if (!comp) return { ok: false, status: 500, error: "Could not create ticket" };
  }

  const now = new Date().toISOString();
  const { data: row, error: leaderError } = await admin
    .from("jam_leaders")
    .insert({
      jam_id: jam.id,
      user_id: userId,
      name: userId ? null : name,
      email: userId ? null : email,
      order_id: comp?.orderId ?? null,
      added_by: input.addedBy,
    })
    .select(LEADER_COLUMNS)
    .single();
  if (leaderError || !row) {
    // A concurrent add of the same person lost the race to the unique index.
    if (comp) await admin.from("ticket_orders").update({ status: "cancelled", updated_at: now }).eq("id", comp.orderId);
    return leaderError?.code === "23505"
      ? { ok: false, status: 409, error: "Already leading this event" }
      : { ok: false, status: 500, error: leaderError?.message ?? "Could not add leader" };
  }

  if (userId) await markAttending(admin, jam.id, userId);

  const eventUrl = `${SITE_URL}${jamPath(jam)}`;
  let emailed = false;
  if (email && !sideEffectsBlocked(`leader email for jam ${jam.id}`)) {
    try {
      const linkedSet = await findEventSet(admin, jam.id);
      const { error } = await resend.emails.send({
        from: EVENTS_FROM_ADDRESS,
        to: email,
        subject: `You're leading at ${jam.name ?? "a SingJam event"}`,
        html: jamLeaderAddedHtml({
          jamId: jam.id,
          jamName: jam.name ?? "the event",
          jamUrl: eventUrl,
          startsAt: jam.starts_at,
          endsAt: jam.ends_at,
          timezone: jam.timezone,
          address: jam.full_address ?? jam.neighborhood ?? null,
          qrToken: comp?.qrToken ?? null,
          hasOwnTicket: !comp,
          setUrl: linkedSet ? `${SITE_URL}${setPath(linkedSet)}` : null,
          signUpUrl: userId ? null : `${SITE_URL}/auth?next=${jamPath(jam)}`,
        }),
      });
      if (error) throw new Error(error.message ?? "Resend send error");
      emailed = true;
      if (comp) {
        await admin.from("ticket_orders").update({ ticket_email_sent_at: new Date().toISOString() }).eq("id", comp.orderId);
      }
    } catch (e) {
      console.error("leader email failed", row.id, e);
    }
  }

  if (userId) {
    await createNotification({
      userId,
      type: "jam_leader_added",
      title: `You're leading at ${jam.name ?? "an event"}`,
      body: comp
        ? "Your ticket is on us. Can't make it? You can step down from the event page."
        : "Thank you! Can't make it? You can step down from the event page.",
      link: jamPath(jam),
    });
  }

  const [leader] = await describeLeaders(admin, [row as JamLeaderRow]);
  return { ok: true, leader, emailed };
}

// Stepping down, or being taken off by the host. The comp is cancelled rather
// than deleted so the guest list history stays intact, and the seat is given
// up — unless the person also bought a ticket of their own, which still stands.
export async function removeJamLeader(
  admin: SupabaseClient,
  leader: JamLeaderRow,
  { notifyHost }: { notifyHost: boolean },
): Promise<void> {
  const now = new Date().toISOString();
  if (leader.order_id) {
    await admin.from("ticket_orders").update({ status: "cancelled", updated_at: now }).eq("id", leader.order_id);
  }

  if (leader.user_id) {
    const { count: bought } = await admin
      .from("ticket_orders")
      .select("id", { count: "exact", head: true })
      .eq("jam_id", leader.jam_id)
      .eq("buyer_user_id", leader.user_id)
      .eq("source", "purchase")
      .eq("status", "paid");
    if (!bought) {
      await admin
        .from("jam_rsvps")
        .update({ status: "cancelled", waitlist_position: null })
        .eq("jam_id", leader.jam_id)
        .eq("user_id", leader.user_id);
    }
  }

  await admin.from("jam_leaders").delete().eq("id", leader.id);

  if (!notifyHost) return;

  const [{ data: jam }, [described]] = await Promise.all([
    admin.from("jams").select("id, name, short_code, host_user_id").eq("id", leader.jam_id).maybeSingle(),
    describeLeaders(admin, [leader]),
  ]);
  if (!jam) return;
  const recipients = new Set([jam.host_user_id, leader.added_by].filter(Boolean) as string[]);
  for (const userId of recipients) {
    await createNotification({
      userId,
      type: "jam_leader_withdrew",
      title: `${described.name} can't lead at ${jam.name ?? "your event"}`,
      body: "Their ticket has been released.",
      link: jamPath(jam),
    });
  }
}

// A full refund voids an order and normally gives up the buyer's seat. When the
// buyer is leading on the ticket they bought — typically refunded because the
// host decided to comp them — they get a leader ticket instead and stay seated.
// Returns whether they are still leading, so the caller keeps their RSVP.
export async function reseatLeaderAfterRefund(
  admin: SupabaseClient,
  order: { jam_id: string; buyer_user_id: string | null; buyer_email: string | null },
): Promise<boolean> {
  const rows = await jamLeaderRows(admin, order.jam_id);
  const leader = rows.find((r) =>
    order.buyer_user_id
      ? r.user_id === order.buyer_user_id
      : !r.user_id && !!order.buyer_email && r.email?.toLowerCase() === order.buyer_email.toLowerCase()
  );
  if (!leader) return false;
  if (leader.order_id) return true;

  const stillHasOne = ownTicketCents(await purchasedOrders(admin, order.jam_id), {
    userId: leader.user_id,
    email: leader.email,
  });
  if (stillHasOne !== null) return true;

  const comp = await issueLeaderTicket(admin, order.jam_id, {
    userId: leader.user_id,
    name: leader.name,
    email: leader.email,
  });
  if (comp) await admin.from("jam_leaders").update({ order_id: comp.orderId }).eq("id", leader.id);
  return true;
}
