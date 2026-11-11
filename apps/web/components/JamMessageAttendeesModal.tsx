"use client";

import { useState } from "react";

type Audience = "attending" | "all_invited";

export default function JamMessageAttendeesModal({
  jamId,
  attendingCount,
  pendingInviteCount,
  onClose,
}: {
  jamId: string;
  attendingCount: number;
  pendingInviteCount: number;
  onClose: () => void;
}) {
  const [audience, setAudience] = useState<Audience>("attending");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [failed, setFailed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const allInvitedCount = attendingCount + pendingInviteCount;
  const recipientCount = audience === "attending" ? attendingCount : allInvitedCount;

  async function handleSend() {
    if (!subject.trim() || !message.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch(`/api/jam/${jamId}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject, message, audience }),
    });
    if (res.ok) {
      const body = await res.json();
      setSent(body.sent);
      setFailed(body.failed ?? 0);
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Something went wrong");
    }
    setSending(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 shadow-xl max-w-md w-full space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {sent !== null ? (
          <>
            <p className="text-base font-semibold text-zinc-900">Message sent</p>
            <p className="text-sm text-zinc-500">
              Your message was sent to {sent} {sent === 1 ? "person" : "people"}.
            </p>
            {failed > 0 && (
              <p className="text-sm text-red-600">
                {failed} {failed === 1 ? "email" : "emails"} couldn&apos;t be delivered.
              </p>
            )}
            <button
              onClick={onClose}
              className="w-full rounded-full bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 transition-colors"
            >
              Done
            </button>
          </>
        ) : (
          <>
            <p className="text-base font-semibold text-zinc-900">Message attendees</p>

            {/* Audience toggle */}
            <div className="flex rounded-xl border border-zinc-200 overflow-hidden text-sm font-medium">
              <button
                onClick={() => setAudience("attending")}
                className={`flex-1 py-2 transition-colors ${
                  audience === "attending"
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                Going ({attendingCount})
              </button>
              <button
                onClick={() => setAudience("all_invited")}
                disabled={allInvitedCount === 0}
                className={`flex-1 py-2 transition-colors border-l border-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed ${
                  audience === "all_invited"
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-600 hover:bg-zinc-50"
                }`}
              >
                All invited ({allInvitedCount})
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Subject</label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Change of plan for tomorrow"
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Message</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Write your message here…"
                  rows={5}
                  className="w-full rounded-xl border border-zinc-200 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/20 resize-none"
                />
              </div>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                onClick={onClose}
                disabled={sending}
                className="flex-1 rounded-full border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending || !subject.trim() || !message.trim() || recipientCount === 0}
                className="flex-1 rounded-full bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 transition-colors"
              >
                {sending ? "Sending…" : `Send to ${recipientCount}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
