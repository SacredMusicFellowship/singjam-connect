import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchAllRows, formatJamDate } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getServerUser, getServerUserRole } from "@/lib/supabase/cached";
import RunSweepButton from "./RunSweepButton";

export const metadata: Metadata = {
  title: "Attendance",
};

type AttendanceRow = {
  id: string;
  email: string;
  user_id: string | null;
  name: string | null;
  source: "checkin" | "ac_import";
  first_timer_tagged_at: string | null;
  jams: { id: string; name: string | null; starts_at: string; timezone: string | null };
};

type Attendee = {
  email: string;
  name: string | null;
  isMember: boolean;
  firstTimerTagged: boolean;
  events: AttendanceRow["jams"][];
};

function groupByPerson(rows: AttendanceRow[]): Attendee[] {
  const byEmail = new Map<string, Attendee>();
  for (const row of rows) {
    const person = byEmail.get(row.email) ?? {
      email: row.email,
      name: null,
      isMember: false,
      firstTimerTagged: false,
      events: [],
    };
    person.name ??= row.name;
    person.isMember ||= row.user_id !== null;
    person.firstTimerTagged ||= row.first_timer_tagged_at !== null;
    person.events.push(row.jams);
    byEmail.set(row.email, person);
  }
  const people = [...byEmail.values()];
  for (const p of people) p.events.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return people.sort(
    (a, b) =>
      b.events.length - a.events.length ||
      b.events[0].starts_at.localeCompare(a.events[0].starts_at) ||
      a.email.localeCompare(b.email)
  );
}

export default async function AdminAttendancePage() {
  // event_attendance holds guest emails and has no client policies, so it is
  // read with the service role — re-check the role rather than trust the layout.
  const [user, role] = await Promise.all([getServerUser(), getServerUserRole()]);
  if (!user || role !== "admin") redirect("/");

  const admin = supabaseAdmin();
  const rows = await fetchAllRows<AttendanceRow>((from, to) =>
    admin
      .from("event_attendance")
      .select("id, email, user_id, name, source, first_timer_tagged_at, jams!inner(id, name, starts_at, timezone)")
      .order("id")
      .range(from, to) as any
  );
  const people = groupByPerson(rows);
  const eventCount = new Set(rows.map((r) => r.jams.id)).size;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Attendance</h1>
          <p className="text-sm text-slate-500">
            Everyone checked in at an official event across {eventCount} {eventCount === 1 ? "event" : "events"}.
            Updated nightly after each event ends; first-timers get the ActiveCampaign tag.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600">
            <span className="font-semibold text-slate-900">{people.length}</span>{" "}
            {people.length === 1 ? "person" : "people"}
          </div>
          <RunSweepButton />
        </div>
      </div>

      {people.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
          No attendance recorded yet.
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {people.map((p) => (
            <li key={p.email}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-medium text-zinc-900">{p.name ?? p.email}</span>
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
      )}
    </div>
  );
}
