"use client";

import { useState } from "react";

// A leader's own controls: stay off the event page, or step down. Shared by
// their row in the event page's Leading list and the /lead/[token] page their
// email links to, so a leader without an account has the same two choices.
export default function LeaderSpotControls({
  token,
  initialShowPublicly,
  onWithdrawn,
  onVisibilityChange,
  compact = false,
}: {
  token: string;
  initialShowPublicly: boolean;
  onWithdrawn: () => void;
  onVisibilityChange?: (show: boolean) => void;
  compact?: boolean;
}) {
  const [showPublicly, setShowPublicly] = useState(initialShowPublicly);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: "withdraw" | "hide" | "show") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/lead/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Something went wrong. Please try again.");
      return;
    }
    if (action === "withdraw") onWithdrawn();
    else {
      setShowPublicly(action === "show");
      onVisibilityChange?.(action === "show");
    }
  }

  if (confirming) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-zinc-700">Step down as a leader? Your ticket will be released and we&apos;ll let the host know.</p>
        <div className="flex gap-2">
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            Keep my spot
          </button>
          <button
            onClick={() => act("withdraw")}
            disabled={busy}
            className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Stepping down…" : "Yes, I can't make it"}
          </button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className={`flex flex-wrap gap-x-4 gap-y-1 ${compact ? "text-xs" : "text-sm"}`}>
        <button
          onClick={() => act(showPublicly ? "hide" : "show")}
          disabled={busy}
          className="text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50"
        >
          {compact ? (showPublicly ? "Don't list me as a leader" : "List me as a leader") : showPublicly ? "Hide me on the event page" : "Show me on the event page"}
        </button>
        <button onClick={() => setConfirming(true)} disabled={busy} className="text-zinc-600 underline hover:text-zinc-900 disabled:opacity-50">
          Can&apos;t make it?
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
