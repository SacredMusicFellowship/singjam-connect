"use client";

import { useMemo, useState } from "react";
import { formatJamDate } from "@singjam/core";

export type AttendedEvent = { id: string; name: string | null; starts_at: string; timezone: string | null };

export type Attendee = {
  email: string;
  name: string | null;
  isMember: boolean;
  firstTimerTagged: boolean;
  // Newest first.
  events: AttendedEvent[];
};

type SortCol = "events" | "name";
type SortDir = "asc" | "desc";

function displayName(p: Attendee) {
  return p.name ?? p.email;
}

export default function AttendanceList({ people, linkedEmail }: { people: Attendee[]; linkedEmail?: string }) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "events", dir: "desc" });

  const sorted = useMemo(() => {
    const mul = sort.dir === "asc" ? 1 : -1;
    const byName = (a: Attendee, b: Attendee) =>
      displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" });
    const list = [...people].sort((a, b) =>
      sort.col === "events"
        ? (a.events.length - b.events.length) * mul || byName(a, b)
        : byName(a, b) * mul
    );
    // Linked from the Users tab: lead with that person whatever the sort.
    const linked = list.findIndex((p) => p.email === linkedEmail);
    if (linked > 0) list.unshift(...list.splice(linked, 1));
    return list;
  }, [people, sort, linkedEmail]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <label htmlFor="attendance-sort" className="text-xs font-medium text-slate-500">
          Sort by
        </label>
        <select
          id="attendance-sort"
          value={sort.col}
          onChange={(e) => {
            const col = e.target.value as SortCol;
            setSort({ col, dir: col === "events" ? "desc" : "asc" });
          }}
          className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 sm:flex-none"
        >
          <option value="events">Times attended</option>
          <option value="name">Name</option>
        </select>
        <button
          onClick={() => setSort((prev) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }))}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-500"
          aria-label={sort.dir === "asc" ? "Sort ascending" : "Sort descending"}
        >
          {sort.dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {sorted.map((p) => (
          <li key={p.email}>
            <details className="group" open={p.email === linkedEmail}>
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate font-medium text-zinc-900">{displayName(p)}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        p.isMember ? "bg-sky-50 text-sky-700" : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {p.isMember ? "Member" : "Guest"}
                    </span>
                    {p.firstTimerTagged && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                        First-timer tagged
                      </span>
                    )}
                  </div>
                  {p.name && <div className="truncate text-xs text-zinc-500">{p.email}</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-zinc-900">
                    {p.events.length} {p.events.length === 1 ? "event" : "events"}
                  </div>
                  <div className="text-xs text-zinc-500">
                    Last: {formatJamDate(p.events[0].starts_at, p.events[0].timezone)}
                  </div>
                </div>
              </summary>
              <ul className="space-y-1 bg-slate-50 px-4 py-3 text-sm">
                {p.events.map((e) => (
                  <li key={e.id} className="flex justify-between gap-3">
                    <a href={`/jam/${e.id}`} className="truncate text-zinc-700 hover:text-zinc-900 hover:underline">
                      {e.name ?? "Untitled event"}
                    </a>
                    <span className="shrink-0 text-zinc-500">{formatJamDate(e.starts_at, e.timezone)}</span>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
