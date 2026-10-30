import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { resolveApiClient } from "@/lib/supabase/apiUser";

export async function GET(req: Request) {
  const { db: supabase, user } = await resolveApiClient(req);

  if (!user) {
    const { data: publicSetsData } = await supabase
      .from("sets")
      .select("id, short_code, name, description, owner_user_id, profiles(display_name, last_name, username)")
      .eq("link_sharing", "public")
      .order("created_at", { ascending: false })
      .limit(20);

    const publicSets = ((publicSetsData ?? []) as any[]).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      ownerUserId: s.owner_user_id,
      ownerName: [s.profiles?.display_name, s.profiles?.last_name].filter(Boolean).join(" ") || s.profiles?.username || null,
      ownerUsername: s.profiles?.username ?? null,
    }));

    return NextResponse.json({ owned: [], collaborating: [], public: publicSets, authenticated: false });
  }

  const [ownedRes, collabRes, publicRes] = await Promise.all([
    supabase
      .from("sets")
      .select("id, short_code, name, description, created_at, owner_user_id, jam_id, link_sharing")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("set_collaborators")
      .select("set_id, role, sets(id, short_code, name, description, created_at, owner_user_id, link_sharing, profiles!owner_user_id(display_name, last_name, username))")
      .eq("user_id", user.id)
      .eq("status", "accepted"),
    supabase
      .from("sets")
      .select("id, short_code, name, description, owner_user_id, profiles(display_name, last_name, username)")
      .eq("link_sharing", "public")
      .neq("owner_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const owned = (ownedRes.data ?? []) as any[];
  const ownedIds = new Set(owned.map((s: any) => s.id));
  // `role` rides along so callers can tell a set the user may only read from one
  // they may add songs to. Viewers still appear here — they can open the set.
  const collaborating = ((collabRes.data ?? []) as any[])
    .map((r) => (r.sets ? { ...r.sets, role: r.role } : null))
    .filter(Boolean)
    .filter((s: any) => s.owner_user_id !== user.id && !ownedIds.has(s.id))
    .map((s: any) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      created_at: s.created_at,
      owner_user_id: s.owner_user_id,
      link_sharing: s.link_sharing,
      role: s.role,
      ownerUserId: s.owner_user_id,
      ownerName: [s.profiles?.display_name, s.profiles?.last_name].filter(Boolean).join(" ") || s.profiles?.username || null,
      ownerUsername: s.profiles?.username ?? null,
    }));

  const collabSetIds = new Set(collaborating.map((s: any) => s.id));
  const publicSets = ((publicRes.data ?? []) as any[])
    .filter((s) => !collabSetIds.has(s.id) && !ownedIds.has(s.id))
    .map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      ownerUserId: s.owner_user_id,
      ownerName: [s.profiles?.display_name, s.profiles?.last_name].filter(Boolean).join(" ") || s.profiles?.username || null,
      ownerUsername: s.profiles?.username ?? null,
    }));

  return NextResponse.json({ owned, collaborating, public: publicSets, authenticated: true });
}

export async function POST(req: Request) {
  const { db: supabase, user } = await resolveApiClient(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, description, jamId } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { data, error } = await supabase
    .from("sets")
    .insert({ name: name.trim(), description: description?.trim() || null, owner_user_id: user.id, jam_id: jamId ?? null })
    .select("id, short_code")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const setId = (data as any).id;

  if (jamId) {
    const admin = supabaseAdmin();
    const [jamRes, rsvpRes] = await Promise.all([
      admin.from("jams").select("host_user_id").eq("id", jamId).single(),
      admin.from("jam_rsvps").select("user_id").eq("jam_id", jamId).eq("status", "attending"),
    ]);

    const attendeeIds = new Set<string>(((rsvpRes.data ?? []) as any[]).map((r: any) => r.user_id));
    if ((jamRes.data as any)?.host_user_id) attendeeIds.add((jamRes.data as any).host_user_id);
    attendeeIds.delete(user.id);

    if (attendeeIds.size > 0) {
      await admin.from("set_collaborators").insert(
        [...attendeeIds].map((uid) => ({
          set_id: setId,
          user_id: uid,
          invited_by: user.id,
          status: "accepted",
        }))
      );
    }
  }

  return NextResponse.json({ id: setId, short_code: (data as any).short_code });
}
