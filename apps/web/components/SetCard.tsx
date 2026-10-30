"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SetCardProps = {
  set: {
    id: string;
    short_code?: string | null;
    name: string;
    description: string | null;
    owner_user_id: string;
  };
  songCount?: number;
  isOwner?: boolean;
  ownerName?: string | null;
  canCopy?: boolean;
  ownerUsername?: string | null;
  linkSharing?: "private" | "link" | "public";
  onDelete?: (id: string) => void;
};

const VISIBILITY_LABELS: Record<string, { label: string; className: string }> = {
  private: { label: "Private",   className: "bg-zinc-100 text-zinc-500" },
  link:    { label: "Open join", className: "bg-amber-100 text-amber-700" },
  public:  { label: "Public",    className: "bg-sky-100 text-sky-700" },
};

export default function SetCard({ set, songCount, isOwner, ownerName, ownerUsername, canCopy, linkSharing, onDelete }: SetCardProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [copying, setCopying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOwner) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [isOwner]);

  async function copySet() {
    setCopying(true);
    setMenuOpen(false);
    const res = await fetch(`/api/sets/${set.id}/copy`, { method: "POST" });
    if (res.ok) {
      const { id } = await res.json();
      router.push(`/set/${id}`);
    } else {
      setCopying(false);
    }
  }

  async function deleteSet() {
    setDeleting(true);
    const res = await fetch(`/api/sets/${set.id}`, { method: "DELETE" });
    if (res.ok) {
      onDelete?.(set.id);
    } else {
      setDeleting(false);
      setConfirming(false);
    }
  }

  const cardBody = (
    <div className="flex overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-colors hover:border-zinc-300">
      <div className="flex-1 min-w-0 p-4">
        <div className="flex items-center gap-2 mb-0.5">
          {isOwner ? (
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Owner</span>
          ) : ownerName ? (
            <span className="text-xs text-zinc-400">
              by{" "}
              {ownerUsername ? (
                <button
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); router.push(`/u/${ownerUsername}`); }}
                  className="font-medium text-zinc-500 hover:underline"
                >
                  {ownerName}
                  {ownerName !== ownerUsername && (
                    <span className="ml-1 font-normal text-zinc-400">@{ownerUsername}</span>
                  )}
                </button>
              ) : (
                <span className="font-medium text-zinc-500">{ownerName}</span>
              )}
            </span>
          ) : (
            <span className="text-xs font-semibold uppercase tracking-wide text-sky-600">Collaborator</span>
          )}
          {!canCopy && linkSharing && VISIBILITY_LABELS[linkSharing] && (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${VISIBILITY_LABELS[linkSharing].className}`}>
              {VISIBILITY_LABELS[linkSharing].label}
            </span>
          )}
        </div>
        <p className="font-semibold text-zinc-900 truncate">{set.name}</p>
        {set.description && (
          <p className="text-sm text-zinc-500 mt-0.5 truncate">{set.description}</p>
        )}
        {songCount != null && (
          <p className="text-xs text-zinc-400 mt-1">
            {songCount} {songCount === 1 ? "song" : "songs"}
          </p>
        )}
      </div>
      {!isOwner && !canCopy && (
        <div className="flex items-center pr-4 text-zinc-300">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </div>
      )}
      {canCopy && (
        <div className="flex items-center pr-3">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); copySet(); }}
            disabled={copying}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
          >
            {copying ? "Copying…" : "Copy"}
          </button>
        </div>
      )}
    </div>
  );

  if (!isOwner && !canCopy) {
    return <Link href={`/set/${set.short_code ?? set.id}`} className="block">{cardBody}</Link>;
  }

  if (canCopy) {
    return <Link href={`/set/${set.short_code ?? set.id}`} className="block">{cardBody}</Link>;
  }

  return (
    <div className="relative">
      <Link href={`/set/${set.short_code ?? set.id}`} className="block">{cardBody}</Link>
      <div className="absolute top-2 right-2" ref={menuRef}>
        <button
          onClick={() => { setMenuOpen((o) => !o); setConfirming(false); }}
          disabled={copying}
          className="rounded-lg p-1 bg-white/90 text-zinc-400 hover:text-zinc-600 hover:bg-white transition-colors shadow-sm disabled:opacity-50"
          aria-label="More options"
        >
          {copying ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M12 2a10 10 0 0 1 0 20" />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden="true">
              <circle cx="4" cy="10" r="1.5" />
              <circle cx="10" cy="10" r="1.5" />
              <circle cx="16" cy="10" r="1.5" />
            </svg>
          )}
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-40 rounded-xl border border-zinc-200 bg-white shadow-lg z-10 overflow-hidden py-1">
            <button
              onClick={copySet}
              className="w-full text-left flex items-center px-4 py-2.5 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Copy set
            </button>
            <button
              onClick={() => { setConfirming(true); setMenuOpen(false); }}
              className="w-full text-left flex items-center px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Delete set
            </button>
          </div>
        )}
        {confirming && (
          <div className="absolute right-0 top-full mt-1 w-56 rounded-xl border border-red-300 bg-red-50 px-4 py-3 shadow-lg z-10 space-y-2">
            <p className="text-sm font-medium text-red-800">Delete this set? This can't be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
              >
                Keep it
              </button>
              <button
                onClick={deleteSet}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
