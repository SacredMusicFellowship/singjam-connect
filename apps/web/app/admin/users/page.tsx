import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchAllRows } from "@singjam/core";
import { fetchAllAuthEmails } from "@/lib/authUsers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getServerSupabase, getServerUser, getServerUserRole } from "@/lib/supabase/cached";
import AdminUsersTable, { type AdminUser } from "./AdminUsersTable";

export const metadata: Metadata = {
  title: "Users",
};

type ProfileRow = Omit<AdminUser, "email" | "events" | "songsAdded">;

export default async function AdminUsersPage() {
  // The layout already guards /admin, but this page reads auth.users through
  // the service role, so it re-checks rather than relying on a sibling render.
  // Both lookups are request-cached, so this costs no extra queries.
  const [user, role] = await Promise.all([getServerUser(), getServerUserRole()]);
  if (!user || role !== "admin") redirect("/");

  const supabase = await getServerSupabase();
  const admin = supabaseAdmin();
  const [profiles, emails, attendance, submitted] = await Promise.all([
    fetchAllRows<ProfileRow>((from, to) =>
      supabase
        .from("profiles")
        .select("id, display_name, last_name, username, avatar_url, neighborhood, created_at, role")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to) as any
    ),
    fetchAllAuthEmails(admin.auth.admin),
    fetchAllRows<{ email: string }>((from, to) =>
      admin.from("event_attendance").select("email").order("id").range(from, to) as any
    ),
    fetchAllRows<{ submitted_by: string }>((from, to) =>
      supabase.from("songs").select("submitted_by").not("submitted_by", "is", null).order("id").range(from, to) as any
    ),
  ]);
  const songsByUser = new Map<string, number>();
  for (const { submitted_by } of submitted) songsByUser.set(submitted_by, (songsByUser.get(submitted_by) ?? 0) + 1);

  // Matched on email rather than user_id so events from before someone made an
  // account, as a guest or a spring AC import, still count.
  const eventsByEmail = new Map<string, number>();
  for (const { email } of attendance) eventsByEmail.set(email, (eventsByEmail.get(email) ?? 0) + 1);

  const users: AdminUser[] = profiles.map((p) => {
    const email = emails.get(p.id) ?? null;
    return { ...p, email, events: email ? eventsByEmail.get(email.toLowerCase()) ?? 0 : 0, songsAdded: songsByUser.get(p.id) ?? 0 };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">
            Everyone with a SingJam profile. Change a role to grant or remove access.
          </p>
        </div>
        <div className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{users.length}</span>{" "}
          {users.length === 1 ? "user" : "users"}
        </div>
      </div>

      <AdminUsersTable users={users} currentUserId={user.id} />
    </div>
  );
}
