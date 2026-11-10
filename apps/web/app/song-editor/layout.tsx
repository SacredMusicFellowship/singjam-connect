import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getServerUser, getServerUserRole } from "@/lib/supabase/cached";
import Link from "next/link";
import AdminPageSkeleton from "@/components/AdminPageSkeleton";

// The nav renders at once; the role check streams in behind a skeleton so
// opening the panel never waits on the auth round trip.
async function RoleGate({ children }: { children: React.ReactNode }) {
  const user = await getServerUser();

  if (!user) redirect("/auth?next=/song-editor");

  const role = await getServerUserRole();
  if (role !== "song_editor" && role !== "admin") redirect("/");

  return <>{children}</>;
}

export default function SongEditorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-2 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:gap-4">
        <span className="w-fit rounded-md bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">
          Song Editor
        </span>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/song-editor" className="text-slate-600 hover:text-slate-900">
            Songs
          </Link>
          <Link href="/song-editor/recent" className="text-slate-600 hover:text-slate-900">
            Recently added
          </Link>
          <Link href="/song-editor/charts" className="text-slate-600 hover:text-slate-900">
            Charts to review
          </Link>
          <Link href="/song-editor/history" className="text-slate-600 hover:text-slate-900">
            Song History
          </Link>
          <Link href="/song-editor/texts" className="text-slate-600 hover:text-slate-900">
            Texts
          </Link>
          <Link href="/song-editor/tunes" className="text-slate-600 hover:text-slate-900">
            Tunes
          </Link>
        </nav>
      </div>
      <Suspense fallback={<AdminPageSkeleton />}>
        <RoleGate>{children}</RoleGate>
      </Suspense>
    </div>
  );
}
