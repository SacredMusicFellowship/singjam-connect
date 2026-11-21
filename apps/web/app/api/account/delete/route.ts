import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteContact } from "@/lib/activecampaign";

export async function DELETE(req: NextRequest) {
  try {
    const admin = supabaseAdmin();
    const supabase = await supabaseServer();
    let user = (await supabase.auth.getUser()).data.user ?? null;
    if (!user) {
      const bearer = req.headers.get("Authorization")?.replace("Bearer ", "");
      if (bearer) user = (await admin.auth.getUser(bearer)).data.user ?? null;
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (user.email) {
      await deleteContact(user.email).catch(() => {});
    }

    // Attendance is keyed by email, not the account, so deleting the user would
    // leave their history behind as a nameless guest.
    const attendanceDeletes = [admin.from("event_attendance").delete().eq("user_id", user.id)];
    if (user.email) {
      attendanceDeletes.push(admin.from("event_attendance").delete().eq("email", user.email.toLowerCase()));
    }
    const attendanceError = (await Promise.all(attendanceDeletes)).find((r) => r.error)?.error;
    if (attendanceError) {
      return NextResponse.json({ error: attendanceError.message }, { status: 500 });
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
