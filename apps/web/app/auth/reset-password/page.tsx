"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function ResetPasswordPage() {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit() {
    if (password !== confirm) {
      setStatus("Passwords don't match.");
      return;
    }
    if (password.length < 8) {
      setStatus("Password must be at least 8 characters.");
      return;
    }

    setBusy(true);
    setStatus(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);

    if (error) {
      setStatus(error.message);
    } else {
      setDone(true);
    }
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">Password updated</h2>
          <p className="mt-2 text-sm text-slate-500">Your password has been changed.</p>
          <button
            onClick={() => router.push("/account")}
            className="mt-4 w-full rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 transition-colors"
          >
            Go to account
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold">Set new password</h1>
      <p className="mt-2 text-sm text-zinc-600">Choose a new password for your account.</p>
      <div className="mt-4 rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700">New password</label>
          <input
            type="password"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Min. 8 characters"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700">Confirm password</label>
          <input
            type="password"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Repeat password"
          />
        </div>
        <button
          onClick={submit}
          disabled={!password || !confirm || busy}
          className="w-full rounded-full bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {busy ? "Saving…" : "Set new password"}
        </button>
        {status && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
