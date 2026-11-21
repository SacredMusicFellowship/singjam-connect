import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseFromBearer } from "@/lib/supabase/bearer";
import { timezoneForAddress } from "@/lib/timezoneForAddress";

async function getUser(req: Request) {
  const supabase = await supabaseServer();
  let user = (await supabase.auth.getUser()).data.user ?? null;
  if (!user) {
    const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (bearer) user = (await supabaseFromBearer(bearer).auth.getUser()).data.user ?? null;
  }
  return user;
}

export async function GET(req: Request) {
  if (!(await getUser(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const address = new URL(req.url).searchParams.get("address")?.trim();
  if (!address) return NextResponse.json({ error: "address is required" }, { status: 400 });

  return NextResponse.json({ timezone: await timezoneForAddress(address) });
}
