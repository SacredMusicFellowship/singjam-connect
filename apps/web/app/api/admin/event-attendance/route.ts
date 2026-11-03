import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth";
import { runEventAttendanceSweep } from "@/lib/eventAttendance";

// Runs the nightly attendance sweep on demand. A shorter budget than the cron's,
// to finish well inside a request timeout; any remainder is reported as deferred.
export async function POST() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const result = await runEventAttendanceSweep(supabaseAdmin(), { budgetMs: 8_000 });
  return NextResponse.json(result);
}
