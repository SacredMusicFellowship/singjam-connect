"use client";

import { useState } from "react";

// A leader stepping down from their row in Who's going.
export default function LeaderSpotControls({
  token,
  hasLeaderTicket,
  onWithdrawn,
}: {
  token: string;
  /** False when they came in on a ticket they bought, which stepping down leaves alone. */
  hasLeaderTicket: boolean;
  onWithdrawn: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function withdraw() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lead/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "withdraw" }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Something went wrong. Please try again.");
      return;
    }
    onWithdrawn();
  }

  if (confirming) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-700">
          {hasLeaderTicket
            ? "Step down as a leader? Your ticket will be released and we'll let the host know."
            : "Step down as a leader? We'll let the host know. The ticket you bought still stands."}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            Keep my spot
          </button>
          <button
            onClick={withdraw}
            disabled={busy}
            className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Stepping down…" : "Step down"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button onClick={() => setConfirming(true)} className="text-xs text-zinc-600 underline hover:text-zinc-900">
        Can&apos;t make it?
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
