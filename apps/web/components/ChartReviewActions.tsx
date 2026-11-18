"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "idle" | "reject" | "replace" | "comment";

const INPUT = "min-w-0 flex-1 rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400";

export default function ChartReviewActions({ submissionId, canReview }: { submissionId: string; canReview: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<Mode>("idle");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "idle" || busy) return;
    function onPointerDown(e: PointerEvent) {
      if (!container.current?.contains(e.target as Node)) {
        setMode("idle");
        setError(null);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [mode, busy]);

  function open(next: Mode) {
    setMode((m) => (m === next ? "idle" : next));
    setError(null);
  }

  async function send(path: string, body: unknown) {
    setBusy(true);
    setError(null);
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't save — try again");
      return;
    }
    setMode("idle");
    setUrl("");
    setText("");
    router.refresh();
  }

  const review = (action: "approve" | "reject" | "replace") =>
    send(`/api/charts/${submissionId}/review`, { action, url, reason: action === "approve" ? undefined : text });

  return (
    <div ref={container} className="flex flex-col gap-2 sm:items-end">
      {!canReview && <p className="text-xs text-zinc-400">You added this — someone else needs to review it.</p>}
      <div className="flex flex-wrap gap-2">
        {canReview && (
          <>
            <button onClick={() => review("approve")} disabled={busy} className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-50">
              Approve
            </button>
            <button onClick={() => open("replace")} disabled={busy} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
              Replace
            </button>
            <button onClick={() => open("reject")} disabled={busy} className="rounded-full border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50">
              Reject
            </button>
          </>
        )}
        <button onClick={() => open("comment")} disabled={busy} className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50">
          Comment
        </button>
      </div>
      {mode === "replace" && (
        <div className="flex w-full flex-col gap-2 sm:w-80">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Better Ultimate Guitar link…" className={INPUT} autoFocus />
          <div className="flex items-center gap-2">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Why? (optional)" maxLength={1000} className={INPUT} />
            <button onClick={() => review("replace")} disabled={busy || !url.trim()} className="rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              Save
            </button>
          </div>
        </div>
      )}
      {mode === "reject" && (
        <div className="flex w-full items-center gap-2 sm:w-80">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Why? (optional)" maxLength={1000} className={INPUT} autoFocus />
          <button onClick={() => review("reject")} disabled={busy} className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50">
            Reject
          </button>
        </div>
      )}
      {mode === "comment" && (
        <div className="flex w-full flex-col gap-2 sm:w-80">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment for other reviewers…" maxLength={1000} rows={3} className={INPUT} autoFocus />
          <button
            onClick={() => send(`/api/charts/${submissionId}/comments`, { body: text })}
            disabled={busy || !text.trim()}
            className="self-end rounded-full bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Post
          </button>
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
