import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerUser, getServerUserRole } from "@/lib/supabase/cached";
import Link from "next/link";
import AdminPageSkeleton from "@/components/AdminPageSkeleton";

// The nav renders at once; the role check streams in behind a skeleton so
// opening the panel never waits on the auth round trip.
async function RoleGate({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();

  if (!user) redirect("/auth?next=/admin");

  if ((await getServerUserRole()) !== "admin") redirect("/");

  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
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
          <Link href="/admin/songs/recent" className="text-slate-600 hover:text-slate-900">
            Recently added
          </Link>
          <Link href="/admin/charts" className="text-slate-600 hover:text-slate-900">
            Charts to review
          </Link>
          <Link href="/admin/songs/import" className="text-slate-600 hover:text-slate-900">
            Import CSV
          </Link>
          <Link href="/admin/song-history" className="text-slate-600 hover:text-slate-900">
            Song History
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
      <Suspense fallback={<AdminPageSkeleton />}>
        <RoleGate>{children}</RoleGate>
      </Suspense>
    </div>
  );
}
