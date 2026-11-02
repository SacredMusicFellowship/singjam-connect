"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { EventAttendanceSweepResult } from "@/lib/eventAttendance";

export default function RunSweepButton() {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    const res = await fetch("/api/admin/event-attendance", { method: "POST" });
    setRunning(false);
    if (!res.ok) {
      setMessage("Sweep failed — check the function logs.");
      return;
    }
    const r: EventAttendanceSweepResult = await res.json();
    setMessage(
      r.importFailed
        ? `Recorded ${r.recorded}. Couldn't read the older AC tags, so no one was tagged — try again.`
        : `Recorded ${r.recorded}, imported ${r.imported}, tagged ${r.tagged}${r.failed ? `, ${r.failed} failed` : ""}.`
    );
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={running}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {running ? "Running…" : "Run now"}
      </button>
      {message && <p className="text-xs text-zinc-500">{message}</p>}
    </div>
  );
}
