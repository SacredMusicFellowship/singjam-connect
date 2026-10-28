import type { SupabaseClient } from "@supabase/supabase-js";
import type { Resend } from "resend";
import { welcomeEmailHtml, finishSetupEmailHtml } from "@/emails/welcome";
import { DEV_SAFETY_ERROR } from "@/lib/devSafety";

const FROM_ADDRESS = "SingJam <hello@singjam.org>";
const MAX_ATTEMPTS = 5;

export const EMAIL_WELCOME = "welcome";

// Both lifecycle variants share the "welcome" type so the unique (user_id,
// type) index guarantees a user gets exactly one of them, ever: the welcome
// proper if they finish profile setup, the nudge if they never do.
type WelcomeVariant = "welcome" | "finish_setup";

type OutboxRow = {
  id: string;
  type: string;
  recipient: string;
  payload: { name?: string | null; variant?: WelcomeVariant | null } | null;
  attempts: number;
};

const OUTBOX_COLS = "id, type, recipient, payload, attempts";

function renderEmail(row: OutboxRow): { subject: string; html: string } {
  switch (row.type) {
    case EMAIL_WELCOME:
      return row.payload?.variant === "finish_setup"
        ? { subject: "Finish setting up your SingJam profile", html: finishSetupEmailHtml() }
        : { subject: "Welcome to SingJam", html: welcomeEmailHtml({ name: row.payload?.name ?? undefined }) };
    default:
      throw new Error(`Unknown email type: ${row.type}`);
  }
}

// Send one outbox row and record the outcome. The Resend SDK returns
// { error } rather than throwing on API errors, so we check both that and any
// thrown network error. Returns true only when the send succeeded.
async function deliver(admin: SupabaseClient, resend: Resend, row: OutboxRow): Promise<boolean> {
  const attempts = row.attempts + 1;
  const now = new Date().toISOString();
  try {
    const { subject, html } = renderEmail(row);
    const { error } = await resend.emails.send({ from: FROM_ADDRESS, to: row.recipient, subject, html });
    // Not an attempt: counting it would fail the row after five local clicks,
    // and production would then never send it.
    if ((error?.name as string | undefined) === DEV_SAFETY_ERROR) return false;
    if (error) throw new Error(error.message ?? "Resend send error");

    await admin
      .from("email_outbox")
      .update({ status: "sent", attempts, sent_at: now, updated_at: now, last_error: null })
      .eq("id", row.id);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from("email_outbox")
      .update({
        status: attempts >= MAX_ATTEMPTS ? "failed" : "pending",
        attempts,
        last_error: message.slice(0, 500),
        updated_at: now,
      })
      .eq("id", row.id);
    console.error(`[emailOutbox] send failed for ${row.recipient} (type=${row.type}, attempt ${attempts}): ${message}`);
    return false;
  }
}

// Enqueue idempotently, then attempt an immediate send so the happy path still
// delivers instantly. The unique (user_id, type) index means a second call for
// the same user is a no-op — the scheduled flush retries any row whose
// immediate send failed.
async function enqueue(
  admin: SupabaseClient,
  resend: Resend,
  opts: { userId: string; email: string; name?: string | null; variant: WelcomeVariant },
): Promise<void> {
  const { data: rows, error } = await admin
    .from("email_outbox")
    .upsert(
      {
        user_id: opts.userId,
        type: EMAIL_WELCOME,
        recipient: opts.email,
        payload: { name: opts.name ?? null, variant: opts.variant },
      },
      { onConflict: "user_id,type", ignoreDuplicates: true },
    )
    .select(OUTBOX_COLS);

  if (error) {
    console.error(`[emailOutbox] enqueue failed for ${opts.email}: ${error.message}`);
    return;
  }
  const row = rows?.[0] as OutboxRow | undefined;
  if (!row) return; // Already enqueued/sent for this user — idempotent no-op.
  await deliver(admin, resend, row);
}

// Called when a profile is saved, not at signup: only then do we know the name
// the user actually chose. Signup used to send this with a system-generated
// username (e.g. "finance3847"), which is not what the user then saw on their
// profile.
export async function enqueueWelcomeEmail(
  admin: SupabaseClient,
  resend: Resend,
  opts: { userId: string; email: string; name?: string | null },
): Promise<void> {
  await enqueue(admin, resend, { ...opts, variant: "welcome" });
}

// Backstop for signups the profile-save path didn't cover: those who never
// finished setup (nudged to come back) and those whose save fired but whose
// send never landed (welcomed properly). See the signups_awaiting_welcome()
// migration for why this exists and how it stays at-most-once.
export async function sweepPendingWelcomes(
  admin: SupabaseClient,
  resend: Resend,
): Promise<number> {
  const { data, error } = await admin.rpc("signups_awaiting_welcome");
  if (error) {
    console.error(`[emailOutbox] signups_awaiting_welcome failed: ${error.message}`);
    return 0;
  }

  const rows = (data ?? []) as { user_id: string; email: string; name: string | null }[];
  for (const row of rows) {
    await enqueue(admin, resend, {
      userId: row.user_id,
      email: row.email,
      name: row.name,
      variant: row.name ? "welcome" : "finish_setup",
    });
  }
  return rows.length;
}

// Retry sweeper: send everything still pending under the attempt cap. Invoked
// by the scheduled flush-email-outbox function.
export async function flushEmailOutbox(
  admin: SupabaseClient,
  resend: Resend,
): Promise<{ sent: number; failed: number }> {
  const { data: rows, error } = await admin
    .from("email_outbox")
    .select(OUTBOX_COLS)
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error(`[emailOutbox] flush query failed: ${error.message}`);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;
  for (const row of (rows ?? []) as OutboxRow[]) {
    if (await deliver(admin, resend, row)) sent++;
    else failed++;
  }
  return { sent, failed };
}
