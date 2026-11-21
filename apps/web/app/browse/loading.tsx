export default function BrowseHubLoading() {
  return (
    <div className="space-y-8">
      <div className="h-7 w-48 animate-pulse rounded bg-zinc-200" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
          <div className="flex flex-wrap gap-1.5">
            {[0, 1, 2, 3, 4, 5].map((j) => <div key={j} className="h-7 w-20 animate-pulse rounded-full bg-zinc-100" />)}
          </div>
        </div>
      ))}
    </div>
  );
}
