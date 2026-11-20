import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ChartError, commentOnChart } from "@/lib/chordCharts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole("admin", "song_editor");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { body } = await req.json().catch(() => ({}));
  try {
    await commentOnChart(supabaseAdmin(), id, auth.user.id, String(body ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChartError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
