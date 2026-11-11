import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requestUser } from "@/lib/requestUser";
import { ChartError, reportChart } from "@/lib/chordCharts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to report a chart." }, { status: 401 });
  const { id } = await params;
  const { note } = await req.json().catch(() => ({}));
  try {
    await reportChart(supabaseAdmin(), id, String(note ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ChartError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
