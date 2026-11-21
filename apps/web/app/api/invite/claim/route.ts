import { NextResponse } from "next/server";
import { claimJamInvite } from "@/lib/claimJamInvite";
import { supabaseServer } from "@/lib/supabase/server";
import { jamPathById } from "@/lib/shortRef";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const jamId = await claimJamInvite(token, user.id);

  return NextResponse.json({ ok: true, jamId, jamPath: jamId ? await jamPathById(jamId) : null });
}
