import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { dropUsCountry } from "@singjam/core";
import { eventReminderHtml } from "../emails/event-reminder";
import { guestTicketBuyers } from "./jamGuestBuyers";
import { loadReminderMessage, renderReminderMessage } from "./reminderMessage";

// Official SingJam events get their own reminders, in place of the day-before
// one every other jam gets from sendJamReminders.
export type EventReminderType = "48h" | "5h";

const FROM_ADDRESS = "SingJam <hello@singjam.org>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";

type EventJam = {
  id: string;
  name: string | null;
  starts_at: string;
  timezone: string | null;
  full_address: string | null;
  neighborhood: string | null;
  host_user_id: string | null;
};

const localDate = (date: Date, tz: string) => new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(date);
const localHour = (date: Date, tz: string) =>
  parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(date));

function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Whether a reminder is due on this run.
 *
 * "48h" — two days before, by the event's own calendar: from 8 AM local on
 * that day until midnight, so a missed 8 AM run is caught up later the same
 * day. A Sunday event's reminder goes out on Friday morning.
 *
 * "5h" — on the day, from five hours before the start until it starts. The
 * job runs hourly, so it lands between five and four hours before.
 */
export function reminderDue(type: EventReminderType, now: Date, jam: Pick<EventJam, "starts_at" | "timezone">): boolean {
  const start = new Date(jam.starts_at);
  if (now >= start) return false;
  const tz = jam.timezone ?? "UTC";
  try {
    switch (type) {
      case "48h":
        return localHour(now, tz) >= 8 && localDate(now, tz) === shiftDate(localDate(start, tz), -2);
      case "5h":
        return now.getTime() >= start.getTime() - 5 * 60 * 60 * 1000;
    }
  } catch (err) {
    console.error(`sendEventReminders: invalid timezone "${tz}"`, err);
    return false;
  }
}

const SUBJECTS: Record<EventReminderType, (jamName: string, day: string) => string> = {
  "48h": (jamName, day) => `See you ${day}: ${jamName}`,
  "5h": (jamName) => `Today: ${jamName}`,
};

async function recipientsFor(admin: SupabaseClient, jam: EventJam) {
  const [{ data: rsvps }, guests] = await Promise.all([
    admin.from("jam_rsvps").select("user_id").eq("jam_id", jam.id).eq("status", "attending"),
    guestTicketBuyers(admin, jam.id),
  ]);

  const userIds = new Set<string>();
  if (jam.host_user_id) userIds.add(jam.host_user_id);
  for (const r of rsvps ?? []) if (r.user_id) userIds.add(r.user_id);

  const members = await Promise.all(
    [...userIds].map(async (id) => {
      const [{ data: profile }, { data: authData }] = await Promise.all([
        admin.from("profiles").select("display_name, username").eq("id", id).single(),
        (admin.auth as any).admin.getUserById(id),
      ]);
      return {
        email: (authData?.user?.email as string | undefined) ?? null,
        name: (profile as any)?.display_name ?? (profile as any)?.username ?? null,
      };
    })
  );

  // One email per address: a member who also bought as a guest under the same
  // address hears from us once.
  const byEmail = new Map<string, string | null>();
  for (const m of members) if (m.email) byEmail.set(m.email.toLowerCase(), m.name);
  for (const [email, name] of guests) if (!byEmail.has(email)) byEmail.set(email, name);
  return [...byEmail].map(([email, name]) => ({ email, name }));
}

export async function sendEventReminders(admin: SupabaseClient, resend: Resend, now = new Date()): Promise<number> {
  // A 48h reminder can be due up to ~3 days ahead (8 AM two local days before a
  // late-evening start); anything further out has nothing due yet.
  const { data: jams, error } = await admin
    .from("jams")
    .select("id, name, starts_at, timezone, full_address, neighborhood, host_user_id")
    .eq("visibility", "official")
    .gte("starts_at", now.toISOString())
    .lte("starts_at", new Date(now.getTime() + 72 * 60 * 60 * 1000).toISOString());
  if (error) {
    console.error("sendEventReminders: failed to fetch events", error);
    throw error;
  }

  let message: string | null = null;
  let sent = 0;
  for (const jam of (jams ?? []) as EventJam[]) {
    for (const type of ["48h", "5h"] as EventReminderType[]) {
      if (!reminderDue(type, now, jam)) continue;
      let claimed = false;
      try {
        // Claim before sending: the unique (jam_id, reminder_type) row is what
        // stops the next hourly run sending it again, so if it can't be
        // written — already sent, or the database doesn't accept this type yet
        // — nothing is sent at all rather than sent every hour.
        const { error: claimError } = await admin
          .from("jam_reminders_sent")
          .insert({ jam_id: jam.id, reminder_type: type });
        if (claimError) continue;
        claimed = true;

        const template = (message ??= await loadReminderMessage(admin));
        const recipients = await recipientsFor(admin, jam);
        const jamName = jam.name ?? "SingJam";
        const jamUrl = `${SITE_URL}/jam/${jam.id}`;
        const tz = jam.timezone ?? undefined;
        const start = new Date(jam.starts_at);
        const day = start.toLocaleString("en-US", { timeZone: tz, weekday: "long" });
        const date = start.toLocaleString("en-US", { timeZone: tz, month: "long", day: "numeric" });
        const time = start.toLocaleString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
        const address = jam.full_address ?? jam.neighborhood;
        // "Add songs to our song menu here": the event's set list, or the event
        // page (where the set list lives) if it has none yet.
        const { data: set } = await admin.from("sets").select("id").eq("jam_id", jam.id).maybeSingle();
        const songMenuUrl = set ? `${SITE_URL}/set/${set.id}` : jamUrl;

        const payloads = recipients.map((r) => ({
          from: FROM_ADDRESS,
          to: r.email,
          subject: SUBJECTS[type](jamName, day),
          html: eventReminderHtml({
            jamName,
            jamUrl,
            messageHtml: renderReminderMessage(template, {
              name: r.name,
              day,
              date,
              time,
              location: address ? dropUsCountry(address) : null,
              songMenuUrl,
            }),
          }),
        }));

        let succeeded = 0;
        for (let i = 0; i < payloads.length; i += 100) {
          const chunk = payloads.slice(i, i + 100);
          const { data, error: sendError } = await resend.batch.send(chunk);
          if (sendError) console.error(`sendEventReminders: batch send failed for ${jam.id} ${type}`, sendError);
          else succeeded += data?.data?.length ?? chunk.length;
        }

        if (payloads.length > 0 && succeeded === 0) throw new Error("every send failed");
        sent += succeeded;
      } catch (err) {
        console.error(`sendEventReminders: error processing ${jam.id} ${type}`, err);
        // Release the claim (e.g. a Resend outage) so the next run retries.
        if (claimed) {
          await admin.from("jam_reminders_sent").delete().eq("jam_id", jam.id).eq("reminder_type", type);
        }
      }
    }
  }
  return sent;
}
