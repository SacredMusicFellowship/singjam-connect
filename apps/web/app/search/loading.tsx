import SongCardSkeleton from "@/components/SongCardSkeleton";

export default function SearchLoading() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Song Library</h1>
      <div className="h-10 animate-pulse rounded-xl bg-zinc-100" />
      <SongCardSkeleton />
    </div>
  );
}
