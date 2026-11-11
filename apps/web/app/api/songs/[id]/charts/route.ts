import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { requestUser } from "@/lib/requestUser";
import { ChartError, submitChart } from "@/lib/chordCharts";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requestUser(req);
  if (!user) return NextResponse.json({ error: "Sign in to add a chord chart." }, { status: 401 });
  const { id } = await params;
  const { url } = await req.json().catch(() => ({}));
  try {
    const result = await submitChart(supabaseAdmin(), id, String(url ?? ""), user.id);
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ChartError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
