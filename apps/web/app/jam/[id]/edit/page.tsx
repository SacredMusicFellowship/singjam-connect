import { jamTags } from "@singjam/core";
import { supabaseServer } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canEditJamById } from "@/lib/jamAuthz";
import EditJamForm from "@/components/EditJamForm";

export default async function EditJamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/auth?next=${encodeURIComponent(`/jam/${id}/edit`)}`);

  const [jamRes, tagsRes, addressRes] = await Promise.all([
    supabase
      .from("jams")
      .select("id, short_code, name, visibility, starts_at, ends_at, neighborhood, notes, tickets_url, image_url, image_focal_point, image_desktop_url, image_mobile_url, image_list_url, image_crops, capacity, host_user_id, guests_can_invite, timezone")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("jam_tags").select("tags(id, name, type)").eq("jam_id", id),
    supabase.rpc("jam_full_address", { jam_id_param: id }),
  ]);

  const jam = jamRes.data ? { ...jamRes.data, full_address: (addressRes.data as string | null) ?? null } : null;
  if (!jam) notFound();
  // The host, or for an official event anyone who can host one. See lib/jamAuthz.ts.
  if (!(await canEditJamById(supabaseAdmin(), id, user.id))) notFound();

  const selectedGenreIds = jamTags(tagsRes.data as any, "genre").map((t) => t.id as string);
  const selectedThemeIds = jamTags(tagsRes.data as any, "theme").map((t) => t.id as string);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit jam</h1>
      <EditJamForm jam={jam as any} selectedGenreIds={selectedGenreIds} selectedThemeIds={selectedThemeIds} />
    </div>
  );
}
