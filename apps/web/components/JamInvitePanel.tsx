"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import SearchInput from "@/components/SearchInput";

type UserResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

export type NewInviteEntry = {
  invited_user_id: string | null;
  invitee_email: string | null;
  display_name?: string | null;
  last_name?: string | null;
  username?: string | null;
};

export default function JamInvitePanel({
  jamId,
  alreadyInvitedIds = [],
  onInvited,
}: {
  jamId: string;
  alreadyInvitedIds?: string[];
  onInvited?: (entry: NewInviteEntry) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set(alreadyInvitedIds));
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setCanShare(!!navigator.share);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) setResults(await res.json());
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  async function inviteUser(userId: string, userHint?: UserResult) {
    setInviting(userId);
    setFeedback(null);
    const user = userHint ?? results.find((u) => u.id === userId);
    const res = await fetch(`/api/jam/${jamId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteeUserId: userId }),
    });
    const body = await res.json();
    if (res.ok) {
      setSent((prev) => new Set([...prev, userId]));
      setQuery("");
      setResults([]);
      setFeedback({ id: "search", msg: "Invite sent!", ok: true });
      onInvited?.({ invited_user_id: userId, invitee_email: null, display_name: user?.display_name, last_name: user?.last_name, username: user?.username });
    } else {
      setFeedback({ id: userId, msg: body.error ?? "Failed to send invite", ok: false });
    }
    setInviting(null);
  }

  async function shareInvite(fallbackChannel?: "sms" | "whatsapp") {
    setShareBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/jam/${jamId}/invite/link`, { method: "POST" });
    const body = await res.json();
    setShareBusy(false);
    if (!res.ok) {
      setFeedback({ id: "link", msg: body.error ?? "Failed to generate link", ok: false });
      return;
    }
    if (!fallbackChannel && navigator.share) {
      try {
        await navigator.share({ text: body.message });
      } catch (e: any) {
        if (e?.name === "AbortError") {
          // User cancelled — remove the invite record we just created
          fetch(`/api/jam/${jamId}/invite/link`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviteId: body.inviteId }),
          }).catch(() => {});
        } else {
          setFeedback({ id: "link", msg: "Couldn't open share sheet", ok: false });
        }
      }
    } else {
      const encoded = encodeURIComponent(body.message);
      const href = fallbackChannel === "whatsapp"
        ? `https://wa.me/?text=${encoded}`
        : `sms:?&body=${encoded}`;
      window.open(href, "_blank");
    }
  }

  async function copyInviteLink() {
    setCopyBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/jam/${jamId}/invite/link`, { method: "POST" });
    const body = await res.json();
    setCopyBusy(false);
    if (!res.ok) {
      setFeedback({ id: "copy", msg: body.error ?? "Failed to generate link", ok: false });
      return;
    }
    try {
      await navigator.clipboard.writeText(body.url);
      setFeedback({ id: "copy", msg: "Link copied!", ok: true });
    } catch {
      setFeedback({ id: "copy", msg: "Couldn't copy link", ok: false });
    }
  }

  async function inviteEmail() {
    const email = emailInput.trim();
    if (!email) return;
    setEmailBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/jam/${jamId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteeEmail: email }),
    });
    const body = await res.json();
    if (res.ok && body.existingMemberId) {
      // Email belongs to an existing member — invite by user ID
      await inviteUser(body.existingMemberId);
      setEmailInput("");
    } else if (res.ok) {
      setFeedback({ id: "email", msg: `Invite sent to ${email}`, ok: true });
      setEmailInput("");
      onInvited?.({ invited_user_id: null, invitee_email: email });
    } else {
      setFeedback({ id: "email", msg: body.error ?? "Failed to send invite", ok: false });
    }
    setEmailBusy(false);
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
      <h2 className="text-base font-semibold">Invite people</h2>

      {/* Member search */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Search by name or username</label>
        <SearchInput
          placeholder="e.g. Sarah, @sarahsings"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onClear={() => setQuery("")}
        />
        {searching && <p className="mt-1.5 text-xs text-zinc-400">Searching…</p>}
        {results.length > 0 && (
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200 overflow-hidden">
            {results.map((u) => {
              const name = [u.display_name, u.last_name].filter(Boolean).join(" ") || u.username || "Unknown";
              const initial = name[0].toUpperCase();
              const isSent = sent.has(u.id);
              return (
                <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-zinc-200">
                    {u.avatar_url ? (
                      <Image src={u.avatar_url} alt={name} fill sizes="32px" className="object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-xs font-medium text-zinc-500">
                        {initial}
                      </span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">{name}</p>
                    {u.username && <p className="text-xs text-zinc-400">@{u.username}</p>}
                  </div>
                  <button
                    onClick={() => inviteUser(u.id)}
                    disabled={isSent || inviting === u.id}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      isSent
                        ? "bg-green-100 text-green-700 cursor-default"
                        : "bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50"
                    }`}
                  >
                    {isSent ? "Sent" : inviting === u.id ? "Sending…" : "Invite"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {feedback && feedback.id !== "email" && (
          <p className={`mt-1.5 text-xs ${feedback.ok ? "text-green-600" : "text-red-600"}`}>
            {feedback.msg}
          </p>
        )}
      </div>

      {/* Email invite */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Invite by email</label>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-xl border border-zinc-300 px-3 py-2 text-sm"
            type="email"
            placeholder="friend@example.com"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") inviteEmail(); }}
          />
          <button
            onClick={inviteEmail}
            disabled={emailBusy || !emailInput.trim()}
            className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {emailBusy ? "Sending…" : "Send"}
          </button>
        </div>
        {feedback && feedback.id === "email" && (
          <p className={`mt-1.5 text-xs ${feedback.ok ? "text-green-600" : "text-red-600"}`}>
            {feedback.msg}
          </p>
        )}
      </div>

      {/* SMS / WhatsApp share — mobile only */}
      <div className="md:hidden">
        <label className="block text-sm font-medium mb-1.5">Invite from your phone</label>
        {canShare ? (
          <button
            onClick={() => shareInvite()}
            disabled={shareBusy}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            {shareBusy ? "Opening…" : (
              <>
                <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
                Share invite
              </>
            )}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => shareInvite("sms")}
              disabled={shareBusy}
              className="flex-1 flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              {shareBusy ? "Opening…" : (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-blue-500" fill="currentColor" aria-hidden="true">
                    <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm0 14H5.17L4 17.17V4h16v12z"/>
                    <circle cx="8" cy="10" r="1"/><circle cx="12" cy="10" r="1"/><circle cx="16" cy="10" r="1"/>
                  </svg>
                  Text
                </>
              )}
            </button>
            <button
              onClick={() => shareInvite("whatsapp")}
              disabled={shareBusy}
              className="flex-1 flex items-center justify-center gap-2 rounded-full border border-[#25D366] bg-white px-4 py-2.5 text-sm font-medium text-[#128C7E] hover:bg-green-50 disabled:opacity-50 transition-colors"
            >
              {shareBusy ? "Opening…" : (
                <>
                  <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="#25D366" aria-hidden="true">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                  </svg>
                  WhatsApp
                </>
              )}
            </button>
          </div>
        )}
        {feedback && feedback.id === "link" && (
          <p className={`mt-1.5 text-xs ${feedback.ok ? "text-green-600" : "text-red-600"}`}>
            {feedback.msg}
          </p>
        )}
      </div>

      {/* Copy invite link */}
      <div>
        <label className="block text-sm font-medium mb-1.5">Copy invite link</label>
        <button
          onClick={copyInviteLink}
          disabled={copyBusy}
          className="w-full flex items-center justify-center gap-2 rounded-full border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
        >
          {copyBusy ? "Copying…" : (
            <>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
              Copy link
            </>
          )}
        </button>
        {feedback && feedback.id === "copy" && (
          <p className={`mt-1.5 text-xs ${feedback.ok ? "text-green-600" : "text-red-600"}`}>
            {feedback.msg}
          </p>
        )}
      </div>
    </div>
  );
}
