import { redirect } from "next/navigation";
import { getServerSupabase, getServerUser, getServerUserRole } from "@/lib/supabase/cached";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();

  if (!user) redirect("/auth?next=/admin");

  if ((await getServerUserRole()) !== "admin") redirect("/");

  const supabase = await getServerSupabase();
  const { count: reviewCount } = await supabase
    .from("songs")
    .select("id", { count: "exact", head: true })
    .eq("needs_review", true);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:gap-4">
        <span className="w-fit rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
          Admin
        </span>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/admin/songs" className="text-slate-600 hover:text-slate-900">
            Songs
          </Link>
          <Link href="/admin/songs/import" className="text-slate-600 hover:text-slate-900">
            Import CSV
          </Link>
          <Link href="/admin/songs/backfill-spotify" className="text-slate-600 hover:text-slate-900">
            Spotify
          </Link>
          <Link href="/admin/song-history" className="text-slate-600 hover:text-slate-900">
            Song History
          </Link>
          <Link href="/admin/songs/review" className="flex items-center gap-1.5 text-slate-600 hover:text-slate-900">
            Review
            {!!reviewCount && reviewCount > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white leading-none">
                {reviewCount}
              </span>
            )}
          </Link>
          <Link href="/admin/users" className="text-slate-600 hover:text-slate-900">
            Users
          </Link>
          <Link href="/admin/attendance" className="text-slate-600 hover:text-slate-900">
            Attendance
          </Link>
          <Link href="/admin/settings" className="text-slate-600 hover:text-slate-900">
            Settings
          </Link>
        </nav>
      </div>
      {children}
    </div>
  );
}
