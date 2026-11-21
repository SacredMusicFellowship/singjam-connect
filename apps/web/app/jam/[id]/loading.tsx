// Mirrors JamView's layout: JamSplit's two columns from sm up (poster and
// who's going beside the title, date, place and description), the map below.
export default function JamLoading() {
  const detailRow = (titleWidth: string, subWidth: string) => (
    <div className="flex items-start gap-3">
      <div className="h-5 w-5 shrink-0 animate-pulse rounded bg-zinc-100" />
      <div className="flex-1 space-y-1.5">
        <div className={`h-4 animate-pulse rounded bg-zinc-200 ${titleWidth}`} />
        <div className={`h-4 animate-pulse rounded bg-zinc-100 ${subWidth}`} />
      </div>
    </div>
  );

  return (
    <div className="space-y-4 pb-10">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-start sm:gap-x-10 sm:gap-y-6">
        <div className="space-y-6">
          <div className="aspect-[3/2] w-full animate-pulse rounded-2xl bg-zinc-100 sm:aspect-square" />
          <div className="hidden space-y-3 sm:block">
            <div className="h-4 w-24 animate-pulse rounded bg-zinc-200" />
            <div className="flex -space-x-2">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-8 w-8 animate-pulse rounded-full border-2 border-white bg-zinc-200" />
              ))}
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-4 sm:space-y-6">
          <div className="space-y-2">
            <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
            <div className="h-7 w-3/4 animate-pulse rounded bg-zinc-200" />
            <div className="h-4 w-40 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="space-y-3">
            {detailRow("w-56", "w-32")}
            {detailRow("w-48", "w-24")}
          </div>
          <div className="flex gap-1.5">
            <div className="h-6 w-16 animate-pulse rounded-full bg-zinc-100" />
            <div className="h-6 w-20 animate-pulse rounded-full bg-zinc-100" />
          </div>
          <div className="h-10 w-36 animate-pulse rounded-xl bg-zinc-200" />
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-zinc-100" />
            <div className="h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
          </div>
        </div>
      </div>

      <div className="h-[260px] animate-pulse rounded-2xl bg-zinc-100" />
    </div>
  );
}
