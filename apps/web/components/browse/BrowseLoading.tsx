import SongCardSkeleton from "@/components/SongCardSkeleton";

export default function BrowseLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-20 animate-pulse rounded bg-amber-100" />
        <div className="h-7 w-1/2 animate-pulse rounded bg-zinc-200" />
        <div className="h-4 w-1/3 animate-pulse rounded bg-zinc-100" />
      </div>
      <SongCardSkeleton />
    </div>
  );
}
