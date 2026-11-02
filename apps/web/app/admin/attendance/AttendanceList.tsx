"use client";

import { Fragment, useMemo, useState } from "react";
import { formatJamDate } from "@singjam/core";

export type AttendedEvent = { id: string; name: string | null; starts_at: string; timezone: string | null };

export type Attendee = {
  email: string;
  name: string | null;
  isUser: boolean;
  firstTimerTagged: boolean;
  // Newest first.
  events: AttendedEvent[];
};

type SortCol = "name" | "email" | "events" | "last";
type SortDir = "asc" | "desc";

// Same fixed-percentage layout as the Users table, so long emails can't push columns off the edge.
const COLUMNS: { key: SortCol; label: string; width: string }[] = [
  { key: "name", label: "Name", width: "34%" },
  { key: "email", label: "Email", width: "30%" },
  { key: "events", label: "Events", width: "14%" },
  { key: "last", label: "Last attended", width: "22%" },
];

function displayName(p: Attendee) {
  return p.name ?? p.email;
}

function lastDate(p: Attendee) {
  return formatJamDate(p.events[0].starts_at, p.events[0].timezone);
}

function Badges({ person }: { person: Attendee }) {
  return (
    <>
      <span
        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
          person.isUser ? "bg-sky-50 text-sky-700" : "bg-zinc-100 text-zinc-600"
        }`}
      >
        {person.isUser ? "User" : "Guest"}
      </span>
      {person.firstTimerTagged && (
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
          First-timer tagged
        </span>
      )}
    </>
  );
}

function EventList({ events }: { events: AttendedEvent[] }) {
  return (
    <ul className="space-y-1 text-sm">
      {events.map((e) => (
        <li key={e.id} className="flex justify-between gap-3">
          <a href={`/jam/${e.id}`} className="truncate text-zinc-700 hover:text-zinc-900 hover:underline">
            {e.name ?? "Untitled event"}
          </a>
          <span className="shrink-0 text-zinc-500">{formatJamDate(e.starts_at, e.timezone)}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AttendanceList({ people, linkedEmail }: { people: Attendee[]; linkedEmail?: string }) {
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir }>({ col: "events", dir: "desc" });
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(linkedEmail ? [linkedEmail] : []));

  function toggleSort(col: SortCol) {
    setSort((prev) =>
      prev.col === col
        ? { col, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { col, dir: col === "events" || col === "last" ? "desc" : "asc" }
    );
  }

  function toggleExpanded(email: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(email)) next.add(email);
      return next;
    });
  }

  const sorted = useMemo(() => {
    const { col, dir } = sort;
    const mul = dir === "asc" ? 1 : -1;
    const byName = (a: Attendee, b: Attendee) =>
      displayName(a).localeCompare(displayName(b), undefined, { sensitivity: "base" });
    const list = [...people].sort((a, b) => {
      let cmp = 0;
      if (col === "name") cmp = byName(a, b);
      else if (col === "email") cmp = a.email.localeCompare(b.email);
      else if (col === "events") cmp = a.events.length - b.events.length;
      else if (col === "last") cmp = a.events[0].starts_at.localeCompare(b.events[0].starts_at);
      return cmp * mul || byName(a, b);
    });
    // Linked from the Users tab: lead with that person whatever the sort.
    const linked = list.findIndex((p) => p.email === linkedEmail);
    if (linked > 0) list.unshift(...list.splice(linked, 1));
    return list;
  }, [people, sort, linkedEmail]);

  return (
    <div className="space-y-2">
      {/* Mobile sort controls */}
      <div className="sm:hidden flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
        <label htmlFor="attendance-sort" className="text-xs font-medium text-slate-500">
          Sort by
        </label>
        <select
          id="attendance-sort"
          value={sort.col}
          onChange={(e) => toggleSort(e.target.value as SortCol)}
          className="flex-1 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700"
        >
          {COLUMNS.map((col) => (
            <option key={col.key} value={col.key}>
              {col.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSort((prev) => ({ ...prev, dir: prev.dir === "asc" ? "desc" : "asc" }))}
          className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-500"
          aria-label={sort.dir === "asc" ? "Sort ascending" : "Sort descending"}
        >
          {sort.dir === "asc" ? "↑" : "↓"}
        </button>
      </div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {sorted.map((p) => (
          <div key={p.email} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <button onClick={() => toggleExpanded(p.email)} className="block w-full text-left">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate font-medium text-slate-900">{displayName(p)}</span>
                <Badges person={p} />
              </div>
              {p.name && <div className="mt-1 truncate text-xs text-slate-500">{p.email}</div>}
              <div className="mt-1 text-xs text-slate-500">
                {p.events.length} {p.events.length === 1 ? "event" : "events"} · Last {lastDate(p)}
              </div>
            </button>
            {expanded.has(p.email) && (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <EventList events={p.events} />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden sm:block overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[40rem] table-fixed text-sm">
          <colgroup>
            {COLUMNS.map((col) => (
              <col key={col.key} style={{ width: col.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
              {COLUMNS.map((col) => (
                <th key={col.key} className="px-4 py-3 select-none">
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="flex items-center gap-1 hover:text-slate-800"
                  >
                    {col.label}
                    <span className="text-slate-300">
                      {sort.col === col.key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((p) => {
              const open = expanded.has(p.email);
              return (
                <Fragment key={p.email}>
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => toggleExpanded(p.email)}
                        aria-expanded={open}
                        className="flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-left"
                      >
                        <span className="text-slate-400">{open ? "▾" : "▸"}</span>
                        <span className="truncate font-medium text-slate-900 hover:text-amber-600">
                          {displayName(p)}
                        </span>
                        <Badges person={p} />
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      <a
                        href={`mailto:${p.email}`}
                        title={p.email}
                        className="block truncate hover:text-amber-600 hover:underline"
                      >
                        {p.email}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">{p.events.length}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">{lastDate(p)}</td>
                  </tr>
                  {open && (
                    <tr className="bg-slate-50">
                      <td colSpan={COLUMNS.length} className="px-4 py-3 pl-10">
                        <EventList events={p.events} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
