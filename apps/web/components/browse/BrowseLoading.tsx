export default function BrowseLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-amber-100" />
        <div className="h-7 w-1/2 animate-pulse rounded bg-zinc-200" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="space-y-1.5 px-4 py-3">
            <div className="h-4 w-2/5 animate-pulse rounded bg-zinc-200" />
            <div className="h-3 w-1/4 animate-pulse rounded bg-zinc-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
