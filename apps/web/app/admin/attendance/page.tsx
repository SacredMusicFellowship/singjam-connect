import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { fetchAllRows } from "@singjam/core";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getServerUser, getServerUserRole } from "@/lib/supabase/cached";
import RunSweepButton from "./RunSweepButton";
import AttendanceList, { type AttendedEvent, type Attendee } from "./AttendanceList";

export const metadata: Metadata = {
  title: "Attendance",
};

type AttendanceRow = {
  id: string;
  email: string;
  user_id: string | null;
  name: string | null;
  source: "checkin" | "ac_import" | "set_join";
  jams: AttendedEvent;
};

function groupByPerson(rows: AttendanceRow[]): Attendee[] {
  const byEmail = new Map<string, Attendee>();
  for (const row of rows) {
    const person = byEmail.get(row.email) ?? {
      email: row.email,
      name: null,
      isUser: false,
      events: [],
    };
    person.name ??= row.name;
    person.isUser ||= row.user_id !== null;
    person.events.push(row.jams);
    byEmail.set(row.email, person);
  }
  const people = [...byEmail.values()];
  for (const p of people) p.events.sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  return people;
}

export default async function AdminAttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const linkedEmail = (await searchParams).email?.toLowerCase();
  // event_attendance holds guest emails and has no client policies, so it is
  // read with the service role — re-check the role rather than trust the layout.
  const [user, role] = await Promise.all([getServerUser(), getServerUserRole()]);
  if (!user || role !== "admin") redirect("/");

  const admin = supabaseAdmin();
  const rows = await fetchAllRows<AttendanceRow>((from, to) =>
    admin
      .from("event_attendance")
      .select("id, email, user_id, name, source, jams!inner(id, name, starts_at, timezone)")
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
            Everyone who checked in or joined the set list at an official event, across {eventCount} {eventCount === 1 ? "event" : "events"}.
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
        <AttendanceList people={people} linkedEmail={linkedEmail} />
      )}
    </div>
  );
}
