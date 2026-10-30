export default function Loading() {
  return (
    <div className="mx-auto max-w-md space-y-4 py-8" aria-busy="true">
      <div>
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-100" />
        <div className="mt-2 h-7 w-56 animate-pulse rounded bg-zinc-200" />
        <div className="mt-2 h-4 w-40 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="h-28 animate-pulse rounded-2xl bg-zinc-100" />
    </div>
  );
}
