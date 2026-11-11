"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JamInviteResponse({ jamId }: { jamId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accepted" | "declined" | null>(null);
  const [done, setDone] = useState(false);

  async function respond(response: "accepted" | "declined") {
    setBusy(response);
    const res = await fetch(`/api/jam/${jamId}/invite/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response }),
    });
    if (res.ok) {
      setDone(true);
      if (response === "accepted") {
        router.refresh();
      }
    }
    setBusy(null);
  }

  if (done) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4">
      <p className="text-sm font-medium text-amber-900">You've been invited to this jam</p>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => respond("declined")}
          disabled={busy !== null}
          className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          {busy === "declined" ? "Declining…" : "Decline"}
        </button>
        <button
          onClick={() => respond("accepted")}
          disabled={busy !== null}
          className="rounded-full bg-amber-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
        >
          {busy === "accepted" ? "RSVPing…" : "Accept & RSVP"}
        </button>
      </div>
    </div>
  );
}
