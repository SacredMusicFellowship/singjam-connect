"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import SearchInput from "@/components/SearchInput";

type UserResult = {
  id: string;
  username: string | null;
  display_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
};

type Collaborator = {
  id: string;
  user_id: string | null;
  status: string;
  role: "editor" | "viewer" | "co-owner";
  profiles: { display_name: string | null; last_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export default function SetInvitePanel({
  setId,
  canAssignCoOwner = false,
  alreadyCollaboratorIds = [],
  onCollaboratorAdded,
}: {
  setId: string;
  canAssignCoOwner?: boolean;
  alreadyCollaboratorIds?: string[];
  onCollaboratorAdded?: (collaborator: Collaborator) => void;
}) {
  const [role, setRole] = useState<"editor" | "viewer" | "co-owner">("editor");
  // Co-owner can only be granted to a specific, named user, and only by the owner.
  const roleOptions = canAssignCoOwner
    ? (["editor", "viewer", "co-owner"] as const)
    : (["editor", "viewer"] as const);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [inviting, setInviting] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set(alreadyCollaboratorIds));
  const [emailInput, setEmailInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [linkRole, setLinkRole] = useState<"editor" | "viewer">("editor");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setCanShare(!!navigator.share);
  }, []);

  useEffect(() => {
    setAdded((prev) => new Set([...alreadyCollaboratorIds, ...prev]));
  }, [alreadyCollaboratorIds]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setSearching(true);
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(query.trim())}`, {
          signal: abortRef.current.signal,
        });
        if (res.ok) setResults(await res.json());
      } catch (e: any) {
        if (e?.name !== "AbortError") throw e;
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  async function inviteUser(userId: string) {
    setInviting(userId);
    setFeedback(null);
    const res = await fetch(`/api/sets/${setId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteeUserId: userId, role }),
    });
    const body = await res.json();
    if (res.ok) {
      setAdded((prev) => new Set([...prev, userId]));
      setFeedback({ id: userId, msg: "Added!", ok: true });
      if (body.collaborator) onCollaboratorAdded?.(body.collaborator);
    } else {
      setFeedback({ id: userId, msg: body.error ?? "Failed to add collaborator", ok: false });
    }
    setInviting(null);
  }

  async function inviteEmail() {
    const email = emailInput.trim();
    if (!email) return;
    setEmailBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/sets/${setId}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteeEmail: email, role }),
    });
    const body = await res.json();
    if (res.ok && body.existingMemberId) {
      await inviteUser(body.existingMemberId);
      setEmailInput("");
    } else if (res.ok) {
      setFeedback({ id: "email", msg: `Invite sent to ${email}`, ok: true });
      setEmailInput("");
    } else {
      setFeedback({ id: "email", msg: body.error ?? "Failed to send invite", ok: false });
    }
    setEmailBusy(false);
  }

  async function shareLink(fallbackChannel?: "sms" | "whatsapp") {
    setShareBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/sets/${setId}/invite/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: linkRole }),
    });
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
          fetch(`/api/sets/${setId}/invite/link`, {
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
    const res = await fetch(`/api/sets/${setId}/invite/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: linkRole }),
    });
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

  async function showQR() {
    setQrBusy(true);
    setFeedback(null);
    const res = await fetch(`/api/sets/${setId}/invite/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: linkRole }),
    });
    const body = await res.json();
    setQrBusy(false);
    if (!res.ok) {
      setFeedback({ id: "qr", msg: body.error ?? "Failed to generate link", ok: false });
      return;
    }
    try {
      // Loaded on demand: only set owners generating a QR invite need it.
      const QRCode = (await import("qrcode")).default;
      const dataUrl = await QRCode.toDataURL(body.url, { width: 280, margin: 2 });
      setQrDataUrl(dataUrl);
    } catch {
      setFeedback({ id: "qr", msg: "Failed to generate QR code", ok: false });
    }
  }

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-4">
      <h2 className="text-base font-semibold">Invite collaborators</h2>

      <div>
        <label className="block text-sm font-medium mb-1.5">Role</label>
        <div className="flex gap-2">
          {roleOptions.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`rounded-xl border px-4 py-1.5 text-sm font-medium transition-colors ${
                role === r
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {r === "co-owner" ? "Co-owner" : r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-zinc-400">
          {role === "co-owner"
            ? "Co-owners can do everything you can except delete the set or assign other co-owners."
            : role === "editor"
            ? "Editors can add, remove, and reorder songs, mark leaders, and invite others."
            : "Viewers can see the set but cannot change songs."}
        </p>
      </div>

      {/* User search */}
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
                  const isAdded = added.has(u.id);
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
                        disabled={isAdded || inviting === u.id}
                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          isAdded
                            ? "bg-green-100 text-green-700 cursor-default"
                            : "bg-amber-500 text-white hover:bg-amber-400 disabled:opacity-50"
                        }`}
                      >
                        {isAdded ? "Added" : inviting === u.id ? "Adding…" : "Add"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {feedback && feedback.id !== "email" && feedback.id !== "link" && (
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
                className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
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

      {/* Link share — mobile only */}
      <div className="md:hidden">
        <label className="block text-sm font-medium mb-1.5">Invite from your phone</label>
        {canShare ? (
          <button
            onClick={() => shareLink()}
            disabled={shareBusy}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
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
              onClick={() => shareLink("sms")}
              disabled={shareBusy}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
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
              onClick={() => shareLink("whatsapp")}
              disabled={shareBusy}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-[#25D366] bg-white px-4 py-2.5 text-sm font-medium text-[#128C7E] hover:bg-green-50 disabled:opacity-50 transition-colors"
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
        <div className="flex gap-2 mb-2">
          {(["editor", "viewer"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setLinkRole(r)}
              className={`rounded-xl border px-4 py-1.5 text-sm font-medium capitalize transition-colors ${
                linkRole === r
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyInviteLink}
            disabled={copyBusy}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
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
          <button
            onClick={showQR}
            disabled={qrBusy}
            className="flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            {qrBusy ? "Generating…" : (
              <>
              <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="3" height="3" rx="0.5"/>
                <rect x="19" y="14" width="2" height="2" rx="0.5"/>
                <rect x="14" y="19" width="2" height="2" rx="0.5"/>
                <rect x="18" y="18" width="3" height="3" rx="0.5"/>
              </svg>
              QR code
              </>
            )}
          </button>
        </div>
        {feedback && (feedback.id === "copy" || feedback.id === "qr") && (
          <p className={`mt-1.5 text-xs ${feedback.ok ? "text-green-600" : "text-red-600"}`}>
            {feedback.msg}
          </p>
        )}
      </div>

      {qrDataUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 md:p-0"
          onClick={() => setQrDataUrl(null)}
        >
          <div
            className="bg-amber-50 rounded-2xl p-6 flex flex-col items-center gap-5 shadow-xl max-w-xs w-full md:max-w-none md:w-full md:h-full md:rounded-none md:justify-center md:gap-10 md:p-16"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <h2 className="text-2xl font-extrabold leading-tight text-amber-600 md:text-6xl">Welcome to SingJam!</h2>
              <p className="mt-1 text-base font-bold text-zinc-800 md:mt-3 md:text-4xl">Scan to see today&apos;s songs</p>
              <p className="mt-4 text-sm font-semibold text-zinc-700 md:mt-8 md:text-2xl flex items-center justify-center gap-x-2 gap-y-1.5 flex-wrap md:gap-x-3 md:max-w-3xl">
                Know one? Tap
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500 px-2.5 py-1.5 text-xs font-medium text-white md:px-4 md:py-2 md:text-xl">
                  I know this song!
                </span>
                so we can sing it together.
              </p>
            </div>
            <img src={qrDataUrl} alt="QR code invite link" className="w-64 h-64 rounded-xl md:w-[440px] md:h-[440px]" />
            <button
              onClick={() => setQrDataUrl(null)}
              className="rounded-xl bg-amber-100 px-6 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-200 transition-colors md:px-8 md:py-3 md:text-base"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
