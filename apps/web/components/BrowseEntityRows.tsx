import Link from "next/link";
import type { BrowseEntityRow } from "@singjam/core";

// Browse pages matching a Song Library search, above the song results.
export default function BrowseEntityRows({ rows, stale }: { rows: BrowseEntityRow[]; stale: boolean }) {
  if (rows.length === 0) return null;
  return (
    <ul
      aria-label="Matching pages"
      className={`divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-opacity ${stale ? "opacity-60" : ""}`}
    >
      {rows.map((r) => (
        <li key={r.id}>
          <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-zinc-50">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-zinc-900">{r.name}</span>
              <span className="block text-xs text-zinc-500">{r.detail}</span>
            </span>
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-zinc-400">
              <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.17 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
            </svg>
          </Link>
        </li>
      ))}
    </ul>
  );
}
