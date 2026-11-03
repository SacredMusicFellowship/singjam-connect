import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { runEventAttendanceSweep } from "@/lib/eventAttendance";

// Runs the nightly attendance sweep on demand.
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const result = await runEventAttendanceSweep(supabaseAdmin());
  return NextResponse.json(result);
}
