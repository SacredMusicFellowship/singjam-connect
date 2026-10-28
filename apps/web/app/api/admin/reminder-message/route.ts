import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DEFAULT_REMINDER_MESSAGE,
  REMINDER_MESSAGE_KEY,
  REMINDER_MESSAGE_MAX_LENGTH,
  loadReminderMessage,
} from "@/lib/reminderMessage";

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const message = await loadReminderMessage(supabaseAdmin());
  return NextResponse.json({ message, defaultMessage: DEFAULT_REMINDER_MESSAGE });
}

// Saving the default (or an empty box) removes the saved row, so a later change
// to the default reaches everyone who never customised it.
export async function PUT(req: Request) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const body = await req.json().catch(() => null);
  if (typeof body?.message !== "string") {
    return NextResponse.json({ error: "message must be a string" }, { status: 400 });
  }
  const message = body.message.trim();
  if (message.length > REMINDER_MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      { error: `The message can be at most ${REMINDER_MESSAGE_MAX_LENGTH} characters.` },
      { status: 400 }
    );
  }

  const admin = supabaseAdmin();
  const { error } =
    !message || message === DEFAULT_REMINDER_MESSAGE
      ? await admin.from("app_settings").delete().eq("key", REMINDER_MESSAGE_KEY)
      : await admin.from("app_settings").upsert(
          { key: REMINDER_MESSAGE_KEY, value: message, updated_at: new Date().toISOString(), updated_by: auth.user.id },
          { onConflict: "key" }
        );
  if (error) {
    console.error("reminder-message: save failed", error);
    return NextResponse.json({ error: "Could not save the message." }, { status: 500 });
  }
  return NextResponse.json({ message: message || DEFAULT_REMINDER_MESSAGE });
}
