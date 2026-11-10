// The "Filters" button above every filterable song list (Song Library, My
// songs, browse pages, a set's Add songs), with the active-filter count.
export default function FiltersButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 flex items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors ${
        count > 0 ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 text-zinc-500 hover:bg-zinc-50"
      }`}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M1.5 3h13a.5.5 0 0 1 0 1H1.5a.5.5 0 0 1 0-1zm2 4h9a.5.5 0 0 1 0 1h-9a.5.5 0 0 1 0-1zm3 4h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1 0-1z" />
      </svg>
      Filters{count > 0 ? ` · ${count}` : ""}
    </button>
  );
}
