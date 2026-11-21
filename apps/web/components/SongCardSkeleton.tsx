// Stands in for a list of SongCards while they load: separate cards, as the list will be.
export default function SongCardSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-2xl border border-zinc-200 p-4 shadow-sm">
          <div className="h-4 w-1/2 animate-pulse rounded bg-zinc-200" />
          <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-zinc-100" />
          <div className="mt-3 flex gap-2">
            <div className="h-8 w-32 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-8 w-28 animate-pulse rounded-full bg-zinc-100" />
          </div>
        </div>
      ))}
    </div>
  );
}
