import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { resend } from "@/lib/resend";
import { sendJamReminders } from "@/lib/sendJamReminders";

export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const admin = supabaseAdmin();

  const sent = await sendJamReminders(admin, resend);
  return NextResponse.json({ sent });
}
