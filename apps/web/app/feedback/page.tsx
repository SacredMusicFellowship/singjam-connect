"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function FeedbackPage() {
  const supabase = supabaseBrowser();
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState("");

  useEffect(() => {
    setPage(document.referrer || window.location.href);
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email) setEmail(user.email);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!description.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, steps, page }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError("Something went wrong. Please try again.");
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-semibold">Thanks for the report!</h1>
        <p className="text-sm text-zinc-500">We'll look into it and follow up if we need more details.</p>
        <button onClick={() => history.back()} className="text-sm text-amber-600 hover:underline">
          ← Go back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Report a bug</h1>
        <p className="mt-1 text-sm text-zinc-500">Tell us what went wrong and we'll get it fixed.</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            What happened? <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the bug…"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">
            Steps to reproduce <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <textarea
            rows={3}
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="1. Go to…&#10;2. Click on…&#10;3. See error"
            className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={submit}
            disabled={busy || !description.trim()}
            className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {busy ? "Sending…" : "Send report"}
          </button>
          <button
            onClick={() => history.back()}
            className="rounded-full border border-zinc-200 px-5 py-2.5 text-sm text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
