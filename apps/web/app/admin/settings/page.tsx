"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ACSyncStatus } from "@/app/api/admin/ac-sync/route";

type Flag = { key: string; label: string; description: string };

const FLAGS: Flag[] = [
  {
    key: "jam_invites",
    label: "Jam invites",
    description: "Show invite buttons on jam pages, friend list, and user profiles.",
  },
];

const LIST_LABELS: Record<string, string> = {
  "1": "SMF",
  "4": "SingJam",
  "9": "Announcements",
};

export default function AdminSettingsPage() {
  const supabase = supabaseBrowser();
  const [values, setValues] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const [acStatus, setAcStatus] = useState<ACSyncStatus[] | null>(null);
  const [acLoading, setAcLoading] = useState(false);
  const [acError, setAcError] = useState<string | null>(null);
  const [resyncing, setResyncing] = useState<Set<string>>(new Set());

  const [reminderSending, setReminderSending] = useState(false);
  const [reminderResult, setReminderResult] = useState<number | null>(null);

  const [revalidating, setRevalidating] = useState(false);
  const [revalidated, setRevalidated] = useState(false);

  useEffect(() => {
    supabase
      .from("feature_flags")
      .select("key, enabled")
      .then(({ data }) => {
        const map: Record<string, boolean> = {};
        for (const row of (data ?? []) as any[]) map[row.key] = row.enabled;
        setValues(map);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(key: string, enabled: boolean) {
    setSaving(key);
    await fetch("/api/admin/feature-flags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, enabled }),
    });
    setValues((prev) => ({ ...prev, [key]: enabled }));
    setSaving(null);
  }

  async function revalidateJams() {
    setRevalidating(true);
    setRevalidated(false);
    await fetch("/api/admin/revalidate-jams", { method: "POST" });
    setRevalidating(false);
    setRevalidated(true);
  }

  async function sendReminders() {
    setReminderSending(true);
    setReminderResult(null);
    const res = await fetch("/api/admin/trigger-jam-reminders", { method: "POST" });
    const data = await res.json();
    setReminderResult(data.sent ?? 0);
    setReminderSending(false);
  }

  // The audit walks every page of auth.users and every AC contact, so it fails
  // rather than reporting on a partial list — surface that instead of parsing
  // an error body as a status array.
  async function loadACStatus() {
    const res = await fetch("/api/admin/ac-sync").catch(() => null);
    if (!res?.ok) {
      setAcError("Could not load the ActiveCampaign audit. Try again in a moment.");
      return;
    }
    setAcError(null);
    setAcStatus(await res.json());
  }

  async function checkACStatus() {
    setAcLoading(true);
    await loadACStatus();
    setAcLoading(false);
  }

  async function resync(rows: ACSyncStatus[]) {
    setResyncing((prev) => new Set([...prev, ...rows.map((r) => r.userId)]));
    await fetch("/api/admin/ac-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userIds: rows.filter((r) => !r.guest).map((r) => r.userId),
        guestEmails: rows.filter((r) => r.guest).map((r) => r.email),
      }),
    });
    // Refresh status after resync
    await loadACStatus();
    setResyncing(new Set());
  }

  const hasACIssue = (s: ACSyncStatus) => !s.inAC || (!s.guest && !s.hasTag) || s.missingLists.length > 0;
  const usersWithIssues = (acStatus ?? []).filter(hasACIssue);
  const usersWithUnsubscribes = (acStatus ?? []).filter((s) => s.unsubscribedLists.length > 0);

  return (
    <div className="space-y-10 max-w-2xl">
      <div className="space-y-6">
        <h1 className="text-xl font-semibold">Feature flags</h1>
        <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 bg-white overflow-hidden">
          {FLAGS.map((flag) => {
            const enabled = values[flag.key] ?? true;
            return (
              <div key={flag.key} className="flex items-center justify-between gap-4 px-5 py-4">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{flag.label}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">{flag.description}</p>
                </div>
                <button
                  onClick={() => toggle(flag.key, !enabled)}
                  disabled={saving === flag.key}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-50 ${enabled ? "bg-amber-500" : "bg-zinc-200"}`}
                >
                  <span
                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${enabled ? "translate-x-5" : "translate-x-0"}`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Upcoming events</h2>
            <p className="text-sm text-zinc-400 mt-0.5">Flush the homepage cache after adding or editing an official event.</p>
          </div>
          <button
            onClick={revalidateJams}
            disabled={revalidating}
            className="text-sm px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-700 disabled:opacity-50"
          >
            {revalidating ? "Refreshing…" : "Refresh now"}
          </button>
        </div>
        {revalidated && (
          <p className="text-sm text-zinc-500">Cache cleared — the homepage will show the latest events within a minute.</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Jam reminders</h2>
            <p className="text-sm text-zinc-400 mt-0.5">Sends 8 AM reminder emails for jams happening tomorrow. Runs automatically every hour.</p>
          </div>
          <button
            onClick={sendReminders}
            disabled={reminderSending}
            className="text-sm px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-700 disabled:opacity-50"
          >
            {reminderSending ? "Sending…" : "Send now"}
          </button>
        </div>
        {reminderResult !== null && (
          <p className="text-sm text-zinc-500">
            {reminderResult === 0 ? "No eligible jams found." : `Sent ${reminderResult} reminder email${reminderResult === 1 ? "" : "s"}.`}
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">ActiveCampaign sync</h2>
          <div className="flex gap-2">
            {acStatus !== null && usersWithIssues.length > 0 && (
              <button
                onClick={() => resync(usersWithIssues)}
                disabled={resyncing.size > 0}
                className="text-sm px-3 py-1.5 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600 disabled:opacity-50"
              >
                Resync all ({usersWithIssues.length})
              </button>
            )}
            <button
              onClick={checkACStatus}
              disabled={acLoading}
              className="text-sm px-3 py-1.5 rounded-lg bg-zinc-900 text-white font-medium hover:bg-zinc-700 disabled:opacity-50"
            >
              {acLoading ? "Checking…" : acStatus === null ? "Check status" : "Refresh"}
            </button>
          </div>
        </div>

        {acError && <p className="text-sm text-red-500">{acError}</p>}

        {acStatus === null && !acLoading && !acError && (
          <p className="text-sm text-zinc-400">Click "Check status" to audit all users against ActiveCampaign.</p>
        )}

        {acLoading && (
          <p className="text-sm text-zinc-400">Fetching data from Supabase and ActiveCampaign…</p>
        )}

        {acStatus !== null && (
          <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-100 text-xs text-zinc-400">
                  <th className="text-left px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">In AC</th>
                  <th className="px-4 py-3 font-medium">Tag</th>
                  <th className="px-4 py-3 font-medium">Lists</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {acStatus.map((s) => {
                  const hasIssue = hasACIssue(s);
                  const isSyncing = resyncing.has(s.userId);
                  const rowBg = hasIssue ? "bg-red-50" : s.unsubscribedLists.length > 0 ? "bg-amber-50" : "";
                  return (
                    <tr key={s.userId} className={rowBg}>
                      <td className="px-4 py-3 text-zinc-700 font-mono text-xs">
                        {s.email}
                        {s.guest && <span className="ml-2 font-sans text-zinc-400">guest buyer</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.inAC ? <span className="text-green-500">✓</span> : <span className="text-red-400">✗</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.guest ? <span className="text-zinc-300">—</span> : s.hasTag ? <span className="text-green-500">✓</span> : <span className="text-red-400">✗</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {s.missingLists.length === 0 && s.unsubscribedLists.length === 0 ? (
                          <span className="text-green-500">✓</span>
                        ) : (
                          <div className="flex flex-col gap-0.5 items-center">
                            {s.missingLists.length > 0 && (
                              <span className="text-red-400 text-xs">
                                missing {s.missingLists.map((id) => LIST_LABELS[id] ?? id).join(", ")}
                              </span>
                            )}
                            {s.unsubscribedLists.length > 0 && (
                              <span className="text-amber-500 text-xs">
                                unsub {s.unsubscribedLists.map((id) => LIST_LABELS[id] ?? id).join(", ")}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {hasIssue && (
                          <button
                            onClick={() => resync([s])}
                            disabled={isSyncing}
                            className="text-xs px-2.5 py-1 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-50"
                          >
                            {isSyncing ? "Syncing…" : "Resync"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-4 py-3 border-t border-zinc-100 text-xs text-zinc-400">
              {acStatus.length} users · {acStatus.filter((s) => !hasACIssue(s) && s.unsubscribedLists.length === 0).length} clean · {usersWithIssues.length} with issues{usersWithUnsubscribes.length > 0 ? ` · ${usersWithUnsubscribes.length} unsubscribed` : ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
