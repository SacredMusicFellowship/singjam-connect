"use client";

import { useState } from "react";

// Anyone signed in can flag a chart (wrong song, wrong key, broken link); it goes
// back to "unreviewed" and into the song editors' review list.
export default function ReportChartButton({ songId, onReported }: { songId: string; onReported?: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  if (state === "sent") return <p className="text-xs text-zinc-500">Thanks — a song editor will take a look.</p>;

  async function send() {
    setState("sending");
    const res = await fetch(`/api/songs/${songId}/charts/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note }),
    });
    setState(res.ok ? "sent" : "failed");
    if (res.ok) onReported?.();
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="text-xs text-zinc-400 underline-offset-2 hover:text-zinc-600 hover:underline">
        Report a problem with this chart
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What's wrong? (optional)"
        maxLength={300}
        className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
        onKeyDown={(e) => { if (e.key === "Enter") send(); if (e.key === "Escape") setOpen(false); }}
        autoFocus
      />
      <button
        onClick={send}
        disabled={state === "sending"}
        className="rounded-full bg-zinc-800 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Report"}
      </button>
      <button onClick={() => setOpen(false)} className="text-xs text-zinc-400 hover:text-zinc-600">Cancel</button>
      {state === "failed" && <span className="text-xs text-red-500">Couldn&apos;t send — try again</span>}
    </div>
  );
}
