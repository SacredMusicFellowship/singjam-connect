export default function AdminAttendanceLoading() {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="h-6 w-32 animate-pulse rounded bg-zinc-200" />
          <div className="h-4 w-80 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-100" />
          <div className="h-8 w-20 animate-pulse rounded-lg bg-zinc-200" />
        </div>
      </div>

      <div className="h-11 animate-pulse rounded-xl border border-slate-200 bg-white" />

      <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100" />
            </div>
            <div className="space-y-1.5">
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-zinc-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
