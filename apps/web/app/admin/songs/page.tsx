import type { Metadata } from "next";
import Link from "next/link";
import AdminSongsTable from "./AdminSongsTable";
import SubmitSongForm from "@/components/SubmitSongForm";

export const metadata: Metadata = {
  title: "Songs",
};

export default async function AdminSongsPage({ searchParams }: { searchParams: Promise<{ added_by?: string }> }) {
  const { added_by } = await searchParams;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Songs</h1>
        <Link href="/admin/songs/new" className="text-xs text-slate-400 hover:text-slate-600">
          Add manually
        </Link>
      </div>
      <SubmitSongForm />
      <AdminSongsTable basePath="/admin/songs" isAdmin addedBy={added_by ?? ""} />
    </div>
  );
}
