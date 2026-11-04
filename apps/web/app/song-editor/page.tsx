import type { Metadata } from "next";
import SongEditorTable from "./SongEditorTable";

export const metadata: Metadata = {
  title: "Song Links",
};

export default async function SongEditorPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Song Links</h1>
      <SongEditorTable initialQuery={q ?? ""} />
    </div>
  );
}
