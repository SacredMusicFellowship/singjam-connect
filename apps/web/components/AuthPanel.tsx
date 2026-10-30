"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthPanel({
  inviteToken,
  defaultMode = "signin",
  next,
}: {
  inviteToken?: string;
  defaultMode?: "signin" | "signup";
  next?: string;
}) {
  const supabase = supabaseBrowser();
  const router = useRouter();

  const [mode, setMode] = useState<"signin" | "signup" | "forgot">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signedUp, setSignedUp] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function switchToSignup() {
    setMode("signup");
    setStatus(null);
    const p = new URLSearchParams(window.location.search);
    p.set("mode", "signup");
    router.replace(`/auth?${p.toString()}`, { scroll: false });
  }

  function switchToSignin() {
    setMode("signin");
    setStatus(null);
    const p = new URLSearchParams(window.location.search);
    p.delete("mode");
    const qs = p.toString();
    router.replace(`/auth${qs ? `?${qs}` : ""}`, { scroll: false });
  }

  async function resolveDestination(): Promise<string> {
    if (next) return inviteToken ? `${next}?invite=${inviteToken}` : next;
    if (inviteToken) {
      // No next param — claim the invite now so we have the jam ID to redirect to.
      // The jam page claims on arrival, but the token won't be in the URL there.
      const res = await fetch("/api/invite/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: inviteToken }),
      });
      const { jamId, jamPath } = res.ok ? await res.json() : {};
      if (jamId) return jamPath ?? `/jam/${jamId}`;
    }
    return "/repertoire";
  }

  async function signInWithPassword() {
    setBusy(true);
    setStatus(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus(error.message);
      setBusy(false);
      return;
    }

    // Signing in is the moment a guest purchase can be attached to an account.
    // OAuth and signup do this server-side; this path reaches neither, so it
    // has to ask. Never blocks the sign-in — a failure here just means the
    // ticket attaches on their next visit instead.
    const claimed = await fetch("/api/tickets/claim", { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);

    const dest = await resolveDestination();
    // Nothing more specific was asked for, and they just turned out to own a
    // ticket — send them to it rather than to their repertoire.
    const claimedJam = claimed?.jam_path ?? (claimed?.jam_ids?.[0] ? `/jam/${claimed.jam_ids[0]}` : null);
    router.push(dest === "/repertoire" && claimedJam ? claimedJam : dest);
  }

  async function signUp() {
    if (password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }
    setBusy(true);
    setStatus(null);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const callbackUrl = new URL(`${siteUrl}/auth/callback`);
    if (inviteToken) callbackUrl.searchParams.set("invite", inviteToken);
    if (next) callbackUrl.searchParams.set("next", next);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: callbackUrl.toString() },
    });

    setBusy(false);

    if (error) {
      setStatus(error.message);
    } else if (data.session) {
      // Email confirmation is disabled — user is signed in immediately.
      // Create profile + link invite before redirecting to account setup.
      const setupRes = await fetch("/api/auth/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteToken }),
      });
      const { jamId, jamPath } = await setupRes.json().catch(() => ({}));

      // The welcome email is sent server-side by /api/auth/complete.

      const dest = jamId ? jamPath ?? `/jam/${jamId}` : next ?? "/repertoire";
      router.push(`/account?next=${encodeURIComponent(dest)}`);
    } else {
      // Confirmation still required (fallback)
      setSignedUp(true);
    }
  }

  async function sendResetEmail() {
    if (!email) return;
    setBusy(true);
    setStatus(null);
    setResetSent(false);
    // The recovery email template links to /auth/confirm with a token hash,
    // which works even when the link is opened in a different browser or
    // device than the one that requested the reset.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/confirm`,
    });
    setBusy(false);
    if (error) {
      setStatus(error.message);
    } else {
      setResetSent(true);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setStatus(null);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const callbackUrl = new URL(`${siteUrl}/auth/callback`);
    if (inviteToken) callbackUrl.searchParams.set("invite", inviteToken);
    if (next) callbackUrl.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) {
      setStatus(error.message);
      setBusy(false);
    }
  }

  async function signInWithApple() {
    setBusy(true);
    setStatus(null);
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const callbackUrl = new URL(`${siteUrl}/auth/callback`);
    if (inviteToken) callbackUrl.searchParams.set("invite", inviteToken);
    if (next) callbackUrl.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: callbackUrl.toString() },
    });
    if (error) {
      setStatus(error.message);
      setBusy(false);
    }
  }

  if (mode === "forgot") {
    return (
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-slate-900">Reset your password</h2>
        <p className="mt-1 text-sm text-slate-500">
          Enter your email and we'll send you a reset link.{" "}
          <button onClick={() => { setMode("signin"); setStatus(null); setResetSent(false); }} className="text-amber-600 hover:underline">
            Back to sign in
          </button>
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Email</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="you@example.com"
            />
          </div>
          <button
            onClick={sendResetEmail}
            disabled={!email || busy}
            className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {busy ? "Sending…" : "Send reset link"}
          </button>
          {resetSent && (
            <div className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
              If an account exists for <strong>{email}</strong>, a password reset link is on its way. Check your spam folder if you don't see it within a couple of minutes.
            </div>
          )}
          {status && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
              {status}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (signedUp) {
    return (
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h2 className="text-xl font-semibold text-slate-900">Check your email</h2>
        <p className="mt-2 text-sm text-slate-500">
          If <strong>{email}</strong> isn't already registered, you'll receive a confirmation link shortly. Click it to activate your account. If you don't receive an email, you may already have an account — try signing in instead.
        </p>
        <button
          onClick={() => { setMode("signin"); setSignedUp(false); }}
          className="mt-4 text-sm text-amber-600 hover:underline"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
      <p className="text-sm text-slate-500">
        {mode === "signin" ? (
          <>No account? <button onClick={switchToSignup} className="text-amber-600 hover:underline">Create one</button></>
        ) : (
          <>Already have an account? <button onClick={switchToSignin} className="text-amber-600 hover:underline">Sign in</button></>
        )}
      </p>

      <div className="mt-6 space-y-4">
        <button
          onClick={signInWithGoogle}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {busy ? "Redirecting..." : "Continue with Google"}
        </button>

        <button
          onClick={signInWithApple}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-900 bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16.365 1.43c0 1.14-.493 2.27-1.177 3.08-.744.9-1.99 1.57-2.987 1.57-.12 0-.23-.02-.3-.03-.01-.06-.04-.22-.04-.39 0-1.14.572-2.27 1.206-2.98.804-.94 2.142-1.64 3.248-1.68.03.13.05.28.05.43zm4.565 15.71c-.03.07-.463 1.58-1.518 3.12-.945 1.34-1.94 2.71-3.43 2.71-1.517 0-1.9-.88-3.63-.88-1.698 0-2.302.91-3.67.91-1.377 0-2.332-1.26-3.428-2.8-1.287-1.82-2.323-4.63-2.323-7.28 0-4.28 2.797-6.55 5.552-6.55 1.448 0 2.675.95 3.6.95.865 0 2.222-1 3.902-1 .613 0 2.886.06 4.407 2.19-.114.07-2.633 1.53-2.633 4.66 0 3.63 3.185 4.9 3.171 4.97z"/>
          </svg>
          {busy ? "Redirecting..." : "Continue with Apple"}
        </button>

        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div className="h-px flex-1 bg-slate-200" />
          or
          <div className="h-px flex-1 bg-slate-200" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700">Email</label>
          <input
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-slate-700">Password</label>
            {mode === "signin" && (
              <button
                type="button"
                onClick={() => { setMode("forgot"); setStatus(null); }}
                className="text-xs text-amber-600 hover:underline"
              >
                Forgot password?
              </button>
            )}
          </div>
          <input
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="••••••••"
          />
        </div>

        {mode === "signup" && (
          <div>
            <label className="text-sm font-medium text-slate-700">Confirm password</label>
            <input
              className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
            />
          </div>
        )}

        <button
          onClick={mode === "signin" ? signInWithPassword : signUp}
          disabled={!email || !password || (mode === "signup" && !confirmPassword) || busy}
          className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-600 disabled:opacity-50 transition-colors"
        >
          {busy ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
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
