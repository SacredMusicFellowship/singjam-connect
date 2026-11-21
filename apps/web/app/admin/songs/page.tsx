import type { Metadata } from "next";
import AdminSongsTable from "./AdminSongsTable";
import SubmitSongForm from "@/components/SubmitSongForm";

export const metadata: Metadata = {
  title: "Songs",
};

export default async function AdminSongsPage({ searchParams }: { searchParams: Promise<{ added_by?: string }> }) {
  const { added_by } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Songs</h1>
      <SubmitSongForm />
      <AdminSongsTable basePath="/admin/songs" isAdmin addedBy={added_by ?? ""} />
    </div>
  );
}
