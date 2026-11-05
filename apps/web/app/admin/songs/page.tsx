import type { Metadata } from "next";
import Link from "next/link";
import AdminSongsTable from "./AdminSongsTable";

export const metadata: Metadata = {
  title: "Songs",
};

export default function AdminSongsPage() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Songs</h1>
        <Link
          href="/admin/songs/new"
          className="rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-400"
        >
          + Add song
        </Link>
      </div>

      <AdminSongsTable />
    </div>
  );
}
