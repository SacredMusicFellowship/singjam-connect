"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ChartReviewActions({ submissionId, ownSubmission }: { submissionId: string; ownSubmission: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (ownSubmission) return <p className="text-xs text-zinc-400">You added this — someone else needs to review it.</p>;

  async function act(action: "approve" | "reject" | "replace") {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/charts/${submissionId}/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, url }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save — try again");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 sm:items-end">
      <div className="flex flex-wrap gap-2">
        <button onClick={() => act("approve")} disabled={busy} className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
          Approve
        </button>
        <button onClick={() => setReplacing((r) => !r)} disabled={busy} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
          Replace
        </button>
        <button onClick={() => act("reject")} disabled={busy} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
          Reject
        </button>
      </div>
      {replacing && (
        <div className="flex w-full items-center gap-2 sm:w-80">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Better Ultimate Guitar link…"
            className="min-w-0 flex-1 rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
          />
          <button onClick={() => act("replace")} disabled={busy || !url.trim()} className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Save
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
