"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import JamMessageAttendeesModal from "@/components/JamMessageAttendeesModal";

export default function JamHostActions({ jamId, canEdit, isOfficial, attendingCount, pendingInviteCount }: { jamId: string; canEdit: boolean; isOfficial: boolean; attendingCount: number; pendingInviteCount: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  async function deleteJam() {
    setDeleting(true);
    setError(null);
    const res = await fetch(`/api/jam/${jamId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/jams");
    } else {
      const body = await res.json();
      setError(body.error ?? "Something went wrong");
      setDeleting(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Manage jam</h2>
          {canEdit && (
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => { setOpen((o) => !o); setConfirming(false); }}
                className="rounded-lg p-1.5 text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
                aria-label="More options"
              >
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="currentColor" aria-hidden="true">
                  <circle cx="4" cy="10" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="16" cy="10" r="1.5" />
                </svg>
              </button>
              {open && (
                <div className="absolute right-0 bottom-full mb-1 w-44 rounded-xl border border-zinc-200 bg-white shadow-lg z-10 overflow-hidden py-1">
                  <Link
                    href={`/jam/${jamId}/edit`}
                    onClick={() => setOpen(false)}
                    className="flex items-center px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Edit details
                  </Link>
                  <Link
                    href={`/jam/new?copy=${jamId}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Copy event
                  </Link>
                  <button
                    onClick={() => { setConfirming(true); setOpen(false); }}
                    className="w-full text-left flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Cancel jam
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* In the card body rather than the host-only dropdown, so co-hosts can
            reach it too — matching who the tickets API and manage page allow. */}
        {isOfficial && (
          <Link
            href={`/jam/${jamId}/tickets/manage`}
            className="block w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors text-left"
          >
            Tickets &amp; guest list
          </Link>
        )}

        <button
          onClick={() => setShowMessageModal(true)}
          disabled={attendingCount === 0 && pendingInviteCount === 0}
          className="w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-left"
        >
          Message attendees
          {attendingCount > 0 && (
            <span className="ml-1.5 text-zinc-400">({attendingCount})</span>
          )}
        </button>

        {confirming && (
          <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-red-800">Cancel this jam? This can't be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={deleteJam}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Cancelling…" : "Yes, cancel"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      {showMessageModal && (
        <JamMessageAttendeesModal
          jamId={jamId}
          attendingCount={attendingCount}
          pendingInviteCount={pendingInviteCount}
          onClose={() => setShowMessageModal(false)}
        />
      )}
    </>
  );
}
