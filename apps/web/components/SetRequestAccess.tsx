"use client";

import { useState } from "react";
import Link from "next/link";

export default function SetRequestAccess({
  setId,
  shortCode,
  setName,
  isLoggedIn,
  inviteToken,
}: {
  setId: string;
  shortCode?: string | null;
  setName: string;
  isLoggedIn: boolean;
  inviteToken?: string;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const setPath = `/set/${shortCode || setId}${inviteToken ? `?invite=${inviteToken}` : ""}`;

  async function handleRequest() {
    setStatus("sending");
    const res = await fetch(`/api/sets/${setId}/request-access`, { method: "POST" });
    setStatus(res.ok ? "sent" : "error");
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm w-full space-y-4 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
          <svg className="h-6 w-6 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
          </svg>
        </div>

        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-zinc-900">
            {!isLoggedIn && inviteToken ? "Sign in to join this set" : "You need access"}
          </h1>
          <p className="text-sm text-zinc-500">
            {!isLoggedIn && inviteToken ? (
              <>You've been invited to <span className="font-medium text-zinc-700">{setName}</span>. Sign in or create a free account to view it.</>
            ) : (
              <>Ask the owner for access to <span className="font-medium text-zinc-700">{setName}</span>.</>
            )}
          </p>
        </div>

        {!isLoggedIn ? (
          <Link
            href={`/auth?next=${encodeURIComponent(setPath)}`}
            className="inline-block rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 transition-colors"
          >
            {inviteToken ? "Sign in" : "Sign in to request access"}
          </Link>
        ) : status === "sent" ? (
          <p className="text-sm text-zinc-500">
            Access requested — the owner has been notified.
          </p>
        ) : status === "error" ? (
          <p className="text-sm text-red-500">Something went wrong. Please try again.</p>
        ) : (
          <button
            onClick={handleRequest}
            disabled={status === "sending"}
            className="rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {status === "sending" ? "Requesting…" : "Request access"}
          </button>
        )}
      </div>
    </div>
  );
}
