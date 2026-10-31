"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import SearchInput from "@/components/SearchInput";
import type { ManagedJamLeader } from "@/lib/jamLeaders";

const formatCents = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

type UserResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

// The host's side of music leaders. Adding someone confirms them — they have
// already said yes — so they are emailed straight away, with a free ticket
// unless they already got one, and can step down from the event page.
export default function JamLeaderManager({
  jamId,
  initialLeaders,
  onChange,
}: {
  jamId: string;
  initialLeaders: ManagedJamLeader[];
  /** Adding or removing a leader seats or unseats them, so the page's lists reload. */
  onChange?: () => void;
}) {
  const [leaders, setLeaders] = useState(initialLeaders);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string; ok: boolean } | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}&include_self=1`);
        if (res.ok) setResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  async function add(payload: { userId: string } | { name: string; email: string }, key: string) {
    setBusy(key);
    setFeedback(null);
    const res = await fetch(`/api/jam/${jamId}/leaders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) {
      setFeedback({ msg: body.error ?? "Couldn't add leader", ok: false });
      return;
    }
    setLeaders((prev) => [...prev, body.leader]);
    onChange?.();
    setQuery("");
    setResults([]);
    setName("");
    setEmail("");
    const l: ManagedJamLeader = body.leader;
    setFeedback(
      !body.emailed
        ? { msg: `${l.name} is leading, but their email didn't send. Let them know directly.`, ok: false }
        : l.own_ticket_cents !== null
          ? { msg: `${l.name} is leading — they already have a ticket, so we didn't issue another.`, ok: true }
          : { msg: `${l.name} is leading — we've emailed their ticket.`, ok: true }
    );
  }

  async function remove(leader: ManagedJamLeader) {
    setBusy(leader.id);
    setFeedback(null);
    const res = await fetch(`/api/jam/${jamId}/leaders`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leaderId: leader.id }),
    });
    setBusy(null);
    if (!res.ok) {
      setFeedback({ msg: "Couldn't remove leader", ok: false });
      return;
    }
    setLeaders((prev) => prev.filter((l) => l.id !== leader.id));
    onChange?.();
  }

  const leadingIds = new Set(leaders.map((l) => l.user_id).filter(Boolean));

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
      <div>
        <h2 className="text-base font-semibold">Music leaders</h2>
        <p className="mt-1 text-sm text-zinc-500">
          For people who&apos;ve already said yes. They&apos;re emailed a free ticket (unless they already have one),
          marked as leading in Who&apos;s going, and can step down from the event page.
        </p>
      </div>

      {leaders.length > 0 && (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
          {leaders.map((l) => (
            <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{l.name}</p>
                <p className="truncate text-xs text-zinc-400">
                  {l.username ? `@${l.username}` : l.email}
                </p>
                {l.own_ticket_cents !== null && (
                  <p className="text-xs text-amber-700">
                    {l.own_ticket_cents > 0
                      ? `Paid ${formatCents(l.own_ticket_cents)} for their own ticket — refund it in Stripe to comp them`
                      : "Has their own ticket"}
                  </p>
                )}
              </div>
              <button
                onClick={() => remove(l)}
                disabled={busy === l.id}
                className="shrink-0 text-xs font-medium text-zinc-500 hover:text-red-600 disabled:opacity-50"
              >
                {busy === l.id ? "Removing…" : "Remove"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <div>
        <label className="block text-sm font-medium mb-1.5">Add a member</label>
        <SearchInput
          placeholder="Search by name or username"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
        />
        {searching && <p className="mt-1.5 text-xs text-zinc-400">Searching…</p>}
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 overflow-hidden">
            {results.map((u) => {
              const label = [u.display_name, u.last_name].filter(Boolean).join(" ") || u.username || "Unknown";
              const leading = leadingIds.has(u.id);
              return (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-200">
                    {u.avatar_url ? (
                      <Image src={u.avatar_url} alt={label} fill sizes="32px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-medium text-zinc-500">
                        {label[0].toUpperCase()}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{label}</p>
                    {u.username && <p className="text-xs text-zinc-400">@{u.username}</p>}
                  </div>
                  <button
                    onClick={() => add({ userId: u.id }, u.id)}
                    disabled={leading || busy === u.id}
                    className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:bg-zinc-200 disabled:text-zinc-500 transition-colors"
                  >
                    {leading ? "Leading" : busy === u.id ? "Adding…" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          add({ name: name.trim(), email: email.trim() }, "guest");
        }}
      >
        <label className="block text-sm font-medium">Not on SingJam yet?</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
          />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-amber-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!name.trim() || !email.trim() || busy === "guest"}
            className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {busy === "guest" ? "Adding…" : "Add"}
          </button>
        </div>
      </form>

      {feedback && <p className={`text-xs ${feedback.ok ? "text-green-700" : "text-red-600"}`}>{feedback.msg}</p>}
    </div>
  );
}
