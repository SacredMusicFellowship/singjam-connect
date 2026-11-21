import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { setPath } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";

// A PNG QR code for a set's short link, so the app can show it full screen without a QR
// library of its own. With ?invite=<token> (from POST /invite/link) it encodes that invite
// link instead, which is what web's "QR code" button shows.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: setId } = await params;
  const invite = new URL(req.url).searchParams.get("invite");
  const admin = supabaseAdmin();

  const { data: set } = await admin.from("sets").select("id, short_code").eq("id", setId).maybeSingle();
  if (!set) return NextResponse.json({ error: "Set not found" }, { status: 404 });

  if (invite) {
    const { data: row } = await admin
      .from("set_collaborators")
      .select("id")
      .eq("set_id", setId)
      .eq("token", invite)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://singjam.org";
  const url = `${baseUrl}${setPath(set)}${invite ? `?invite=${encodeURIComponent(invite)}` : ""}`;
  const png = await QRCode.toBuffer(url, { width: 560, margin: 2 });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // An invite token works like a password, so nothing shared may cache it.
      "Cache-Control": "private, no-store",
    },
  });
}
