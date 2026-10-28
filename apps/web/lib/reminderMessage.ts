import type { SupabaseClient } from "@supabase/supabase-js";

// Sherri's wording. {name}, {day}, {date}, {time} and {location} are filled in
// per email; {song_menu} becomes a link reading "here".
export const DEFAULT_REMINDER_MESSAGE =
  "Hi {name},\n\nWe'll see you at SingJam this {day}, {date} at {time} at {location}. " +
  "You can add songs to our song menu {song_menu}. Look forward to making music with you!";

// The app_settings key the admin settings page saves an edited message under.
export const REMINDER_MESSAGE_KEY = "event_reminder_message";
export const REMINDER_MESSAGE_MAX_LENGTH = 2000;

/**
 * The message to send: the one saved at /admin/settings, or the default when
 * none is saved — or when it can't be read (including before migration 168 is
 * applied), so a settings problem never stops reminders going out.
 */
export async function loadReminderMessage(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from("app_settings")
    .select("value")
    .eq("key", REMINDER_MESSAGE_KEY)
    .maybeSingle();
  const value = !error && typeof data?.value === "string" ? data.value.trim() : "";
  return value || DEFAULT_REMINDER_MESSAGE;
}

export type ReminderValues = {
  name: string | null;
  day: string;
  date: string;
  time: string;
  location: string | null;
  songMenuUrl: string;
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * The reminder message as email HTML: one <p> per blank-line-separated
 * paragraph, single line breaks kept. The template and every value are
 * escaped, so the only markup is what this adds. An unknown {placeholder} is
 * left as typed, so a typo shows up in a test send instead of vanishing.
 */
export function renderReminderMessage(template: string, v: ReminderValues): string {
  const values: Record<string, string> = {
    name: escapeHtml(v.name?.trim() || "there"),
    day: escapeHtml(v.day),
    date: escapeHtml(v.date),
    time: escapeHtml(v.time),
    location: escapeHtml(v.location ?? "the venue"),
    song_menu: `<a href="${escapeHtml(v.songMenuUrl)}" style="color:#d97706;text-decoration:underline">here</a>`,
  };
  return escapeHtml(template.trim())
    .split(/\n\s*\n/)
    .map((para) =>
      para.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole).replace(/\n/g, "<br>")
    )
    .map((para) => `<p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px">${para}</p>`)
    .join("\n");
}
