import { supabaseAdmin } from "@/lib/supabase/admin";
import { sideEffectsBlocked } from "@/lib/devSafety";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

type ExpoPushTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

export async function createNotification({
  userId,
  type,
  title,
  body,
  link,
}: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}) {
  // Both halves reach real people: the row shows in their inbox in the app,
  // and the push lands on their phone.
  if (sideEffectsBlocked(`notification to ${userId}`)) return;
  const admin = supabaseAdmin();
  await admin.from("notifications").insert({ user_id: userId, type, title, body, link });
  await sendPush(admin, { userId, title, body, link });
}

// Push delivery is best-effort — the notifications row is the source of truth,
// so failures here must never surface to createNotification's callers.
async function sendPush(
  admin: ReturnType<typeof supabaseAdmin>,
  { userId, title, body, link }: { userId: string; title: string; body?: string; link?: string }
) {
  try {
    const { data: tokens } = await admin
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);
    if (!tokens || tokens.length === 0) return;

    const messages = tokens.map((t) => ({
      to: t.token,
      title,
      ...(body ? { body } : {}),
      ...(link ? { data: { link } } : {}),
      sound: "default",
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    if (!res.ok) return;

    const { data: tickets } = (await res.json()) as { data?: ExpoPushTicket[] };
    const deadTokens = tokens
      .filter((_, i) => tickets?.[i]?.details?.error === "DeviceNotRegistered")
      .map((t) => t.token);
    if (deadTokens.length > 0) {
      await admin.from("push_tokens").delete().in("token", deadTokens);
    }
  } catch {
    // swallow — see note above
  }
}
