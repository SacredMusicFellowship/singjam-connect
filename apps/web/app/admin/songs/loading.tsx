import { AdminSongsTableSkeleton } from "./AdminSongsTable";

export default function AdminSongsLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-6 w-20 animate-pulse rounded bg-zinc-200" />
        <div className="h-4 w-24 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="h-36 animate-pulse rounded-2xl border border-dashed border-zinc-200" />
      <AdminSongsTableSkeleton />
    </div>
  );
}
