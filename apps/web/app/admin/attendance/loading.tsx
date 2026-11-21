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

      <div className="space-y-2">
        {/* Mobile sort controls skeleton */}
        <div className="sm:hidden h-9 animate-pulse rounded-xl border border-slate-200 bg-white" />

        {/* Mobile card skeleton */}
        <div className="sm:hidden space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
              <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200" />
              <div className="mt-1.5 h-3 w-2/3 animate-pulse rounded bg-zinc-100" />
              <div className="mt-1.5 h-3 w-2/5 animate-pulse rounded bg-zinc-100" />
            </div>
          ))}
        </div>

        {/* Desktop table skeleton */}
        <div className="hidden sm:block overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
            <div className="h-3 w-full animate-pulse rounded bg-zinc-200" />
          </div>
          <div className="divide-y divide-slate-100">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="flex items-center gap-4 px-4 py-2.5">
                <div className="h-4 w-1/4 animate-pulse rounded bg-zinc-200" />
                <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-12 animate-pulse rounded bg-zinc-100" />
                <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
