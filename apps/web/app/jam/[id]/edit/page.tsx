import { supabaseServer } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { canManageJam } from "@/lib/jamAuthz";
import EditJamForm from "@/components/EditJamForm";
import { loadEventReminderMessage } from "@/lib/reminderMessage";

export default async function EditJamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(`/auth?next=${encodeURIComponent(`/jam/${id}/edit`)}`);

  const [jamRes, genresRes, themesRes] = await Promise.all([
    supabase
      .from("jams")
      .select("id, name, visibility, starts_at, ends_at, neighborhood, full_address, notes, tickets_url, image_url, image_focal_point, capacity, host_user_id, guests_can_invite, timezone")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("jam_genres").select("genre_id").eq("jam_id", id),
    supabase.from("jam_themes").select("theme_id").eq("jam_id", id),
  ]);

  const jam = jamRes.data;
  if (!jam) notFound();
  // Official events belong to the org, so anyone who can host one can run any
  // of them — not only whoever created it. See lib/jamAuthz.ts.
  if (!(await canManageJam(supabaseAdmin(), id, user.id))) notFound();

  // Read on its own so the page still loads before migration 170 adds the column.
  const reminderMessage = await loadEventReminderMessage(supabaseAdmin(), id);

  const selectedGenreIds = ((genresRes.data ?? []) as any[]).map((r) => r.genre_id as string);
  const selectedThemeIds = ((themesRes.data ?? []) as any[]).map((r) => r.theme_id as string);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Edit jam</h1>
      <EditJamForm jam={{ ...(jam as any), reminder_message: reminderMessage }} selectedGenreIds={selectedGenreIds} selectedThemeIds={selectedThemeIds} />
    </div>
  );
}
