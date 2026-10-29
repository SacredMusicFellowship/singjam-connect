import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { jamReminderHtml } from "../emails/jam-reminder";

const FROM_ADDRESS = "SingJam <hello@singjam.org>";

function localDateStr(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(date);
}

function localHour(date: Date, tz: string): number {
  return parseInt(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(date)
  );
}

function isJamTomorrow(now: Date, jamStartsAt: string, tz: string): boolean {
  const todayStr = localDateStr(now, tz);
  const [y, m, d] = todayStr.split("-").map(Number);
  const tomorrow = new Date(y, m - 1, d + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  return localDateStr(new Date(jamStartsAt), tz) === tomorrowStr;
}

// Eligible from 8 AM local on the day before until local midnight: the reminder
// normally goes out on the 8 AM run, but using >= 8 (rather than === 8) lets a
// later run the same day catch up if the 8 AM run was missed or failed. The
// jam_reminders_sent unique row keeps it to one send.
function isEligible(now: Date, jam: { starts_at: string | null; timezone: string | null }): boolean {
  if (!jam.starts_at) return false;
  const tz = jam.timezone ?? "UTC";
  try {
    return localHour(now, tz) >= 8 && isJamTomorrow(now, jam.starts_at, tz);
  } catch (err) {
    console.error(`sendJamReminders: invalid timezone "${tz}"`, err);
    return false;
  }
}

export async function sendJamReminders(admin: SupabaseClient, resend: Resend): Promise<number> {
  const now = new Date();

  // Coarse prefilter; isEligible is the source of truth. A jam happening
  // "tomorrow" in its own timezone is at most ~40h away once it is 8 AM there.
  const windowStart = now.toISOString();
  const windowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString();

  const { data: alreadySent } = await admin
    .from("jam_reminders_sent")
    .select("jam_id")
    .eq("reminder_type", "24h");

  const alreadySentIds = (alreadySent ?? []).map((r: { jam_id: string }) => r.jam_id);

  let jamsQuery = admin
    .from("jams")
    .select("id, name, starts_at, timezone, full_address, neighborhood, host_user_id")
    .gte("starts_at", windowStart)
    .lte("starts_at", windowEnd);

  if (alreadySentIds.length > 0) {
    jamsQuery = jamsQuery.not("id", "in", `(${alreadySentIds.join(",")})`);
  }

  const { data: jams, error } = await jamsQuery;

  if (error) {
    console.error("sendJamReminders: failed to fetch jams", error);
    throw error;
  }

  const eligibleJams = (jams ?? []).filter((jam) => isEligible(now, jam));

  if (eligibleJams.length === 0) return 0;

  let sent = 0;

  for (const jam of eligibleJams) {
    // Isolate each jam so a failure on one doesn't abort reminders for the rest.
    try {
      const address = jam.full_address ?? jam.neighborhood ?? null;
      const jamUrl = `https://singjam.org/jam/${jam.id}`;
      const jamDay = new Date(jam.starts_at).toLocaleString("en-US", {
        timeZone: jam.timezone ?? undefined,
        weekday: "long",
      });

      const [{ data: rsvps }, { data: pendingInvites }] = await Promise.all([
        admin
          .from("jam_rsvps")
          .select("user_id")
          .eq("jam_id", jam.id)
          .eq("status", "attending"),
        admin
          .from("jam_invites")
          .select("invited_user_id")
          .eq("jam_id", jam.id)
          .eq("status", "pending"),
      ]);

      // Collect unique user_ids: host + attending RSVPs + pending invites.
      // Link invites have a null invited_user_id and must be skipped — passing
      // null to getUserById throws and would abort the whole send.
      const userIdSet = new Set<string>();
      if (jam.host_user_id) userIdSet.add(jam.host_user_id);
      for (const r of rsvps ?? []) if (r.user_id) userIdSet.add(r.user_id);
      for (const i of pendingInvites ?? []) if (i.invited_user_id) userIdSet.add(i.invited_user_id);

      const profilesAndEmails = await Promise.all(
        [...userIdSet].map(async (user_id) => {
          const [{ data: profile }, { data: authData }] = await Promise.all([
            admin.from("profiles").select("display_name, username").eq("id", user_id).single(),
            (admin.auth as any).admin.getUserById(user_id),
          ]);
          return {
            email: authData?.user?.email ?? null,
            name: (profile as any)?.display_name ?? (profile as any)?.username ?? null,
          };
        })
      );

      const recipients = profilesAndEmails.filter((r) => r.email !== null) as { email: string; name: string | null }[];

      if (recipients.length === 0) {
        // Nothing to send; record so we don't reprocess this jam every hour.
        await admin.from("jam_reminders_sent").insert({ jam_id: jam.id, reminder_type: "24h" });
        continue;
      }

      const payloads = recipients.map((r) => ({
        from: FROM_ADDRESS,
        to: r.email,
        subject: `Reminder: ${jam.name ?? "Your jam"} is tomorrow (${jamDay})`,
        html: jamReminderHtml({
          name: r.name,
          jamName: jam.name ?? "Your jam",
          jamUrl,
          startsAt: jam.starts_at,
          timezone: jam.timezone,
          address,
        }),
      }));

      // Resend allows only 5 requests/sec, so send via the batch endpoint (up
      // to 100 emails in a single request) instead of one request per
      // recipient — otherwise jams with >5 recipients lose the overflow to 429s.
      let succeeded = 0;
      for (let i = 0; i < payloads.length; i += 100) {
        const chunk = payloads.slice(i, i + 100);
        const { data, error } = await resend.batch.send(chunk);
        if (error) {
          console.error(`sendJamReminders: batch send failed for jam ${jam.id}`, error);
        } else {
          succeeded += data?.data?.length ?? chunk.length;
        }
      }

      if (succeeded === 0) {
        // Every send failed (e.g. a Resend outage). Leave the jam unrecorded so
        // the next hourly run retries instead of silently dropping the reminder.
        console.error(`sendJamReminders: all sends failed for jam ${jam.id}; will retry next run`);
        continue;
      }

      // Record only after a successful send so a failed send is retried.
      await admin.from("jam_reminders_sent").insert({ jam_id: jam.id, reminder_type: "24h" });
      sent += succeeded;
    } catch (err) {
      console.error(`sendJamReminders: error processing jam ${jam.id}`, err);
    }
  }

  return sent;
}
