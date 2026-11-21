"use client";

import { useState } from "react";

type RsvpStatus = "attending" | "waitlist" | "cancelled" | null;

export default function JamRsvpButton({
  jamId,
  initialStatus,
  initialWaitlistPosition,
  attendingCount,
  capacity,
  onStatusChange,
}: {
  jamId: string;
  initialStatus: RsvpStatus;
  initialWaitlistPosition: number | null;
  attendingCount: number;
  capacity: number | null;
  onStatusChange?: (status: RsvpStatus) => void;
}) {
  const [status, setStatus] = useState<RsvpStatus>(initialStatus);
  const [waitlistPosition, setWaitlistPosition] = useState<number | null>(initialWaitlistPosition);
  const [count, setCount] = useState(attendingCount);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const spotsLeft = capacity !== null ? capacity - count : null;
  const isFull = capacity !== null && spotsLeft !== null && spotsLeft <= 0;

  async function rsvp() {
    const optimisticStatus = isFull ? "waitlist" : "attending";
    if (!isFull) setCount((c) => c + 1);
    setStatus(optimisticStatus);
    setBusy(true);
    const res = await fetch(`/api/jam/${jamId}/rsvp`, { method: "POST" });
    const json = await res.json();
    setStatus(json.status);
    setWaitlistPosition(json.waitlist_position ?? null);
    onStatusChange?.(json.status);
    if (json.status !== "attending" && optimisticStatus === "attending") setCount((c) => c - 1);
    else if (json.status === "attending" && optimisticStatus !== "attending") setCount((c) => c + 1);
    setBusy(false);
  }

  async function cancel() {
    const prevStatus = status;
    const prevCount = count;
    const prevWaitlistPosition = waitlistPosition;
    if (status === "attending") setCount((c) => Math.max(0, c - 1));
    setStatus("cancelled");
    setWaitlistPosition(null);
    setBusy(true);
    const res = await fetch(`/api/jam/${jamId}/rsvp`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      setStatus(prevStatus);
      setCount(prevCount);
      setWaitlistPosition(prevWaitlistPosition);
    }
  }

  return (
    <div className="space-y-2">
      {capacity !== null && (
        <p className="text-xs text-zinc-500">
          {status === "attending"
            ? `${count} attending · ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`
            : isFull
            ? `${count}/${capacity} attending · Full`
            : `${count}/${capacity} attending · ${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left`}
        </p>
      )}

      {status === "attending" ? (
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
            ✓ You're going
          </span>
          <button
            onClick={cancel}
            disabled={busy}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Cancel RSVP
          </button>
        </div>
      ) : status === "waitlist" ? (
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700">
            #{waitlistPosition} on waitlist
          </span>
          <button
            onClick={cancel}
            disabled={busy}
            className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            Leave waitlist
          </button>
        </div>
      ) : confirming ? (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { rsvp(); setConfirming(false); }}
            disabled={busy}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {isFull ? "Join waitlist" : "I'm going"}
          </button>
          <button
            onClick={() => setConfirming(false)}
            disabled={busy}
            className="rounded-full border border-zinc-200 px-4 py-2 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Can't go
          </button>
        </div>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          disabled={busy}
          className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {isFull ? "Join waitlist" : "RSVP"}
        </button>
      )}
    </div>
  );
}
