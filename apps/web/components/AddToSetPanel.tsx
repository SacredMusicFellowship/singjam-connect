"use client";

import { useEffect, useRef, useState } from "react";
import { popoverSideFor } from "@/lib/popoverSide";

type SetInfo = { id: string; name: string };

// The button keeps one size open or closed (smaller on phones), so it doesn't jump when tapped.
const BUTTON_SIZE = "rounded-full border px-3 py-1 text-xs sm:py-1.5 sm:text-sm transition-colors";

export default function AddToSetPanel({
  songId,
  sets,
  inSets,
  onOpen,
  onAdded,
  onSetCreated,
}: {
  songId: string;
  sets: SetInfo[] | null;
  inSets: Set<string> | undefined;
  onOpen?: () => void;
  onAdded?: (setId: string) => void;
  onSetCreated?: (set: SetInfo) => void;
}) {
  const [open, setOpen] = useState(false);
  // Down unless the list would run off the bottom of the screen, decided as it opens.
  const [side, setSide] = useState<"up" | "down">("down");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function addToSet(setId: string, name?: string) {
    setOpen(false);
    const setName = name ?? sets?.find((s) => s.id === setId)?.name;
    const res = await fetch(`/api/sets/${setId}/songs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    });
    if (res.ok) onAdded?.(setId);
    const msg = res.ok
      ? `Added to ${setName ?? "set"}`
      : res.status === 409
      ? "Already in that set"
      : null;
    if (msg) {
      setStatus(msg);
      setTimeout(() => setStatus(null), 2500);
    }
  }

  async function createSetAndAdd(name: string) {
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { alert("Failed to create set"); return; }
    const { id } = await res.json();
    onSetCreated?.({ id, name });
    setCreating(false);
    setNewName("");
    await addToSet(id, name);
  }

  if (status) {
    return <span className="text-xs text-green-600">{status}</span>;
  }

  if (!open) {
    return (
      <button
        onClick={(e) => {
          // Each set is a ~45px row, plus "+ New set…"; the list scrolls past 224px.
          setSide(popoverSideFor(e.currentTarget, Math.min(45 * ((sets?.length ?? 2) + 1), 270) + 8));
          setOpen(true);
          onOpen?.();
        }}
        className={`${BUTTON_SIZE} border-zinc-200 text-zinc-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700`}
      >
        Add to set
      </button>
    );
  }

  if (creating) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newName.trim()) createSetAndAdd(newName.trim());
            if (e.key === "Escape") { setCreating(false); setNewName(""); }
          }}
          placeholder="Set name…"
          autoFocus
          className="w-28 rounded-xl border border-zinc-300 px-2 py-1.5 text-sm focus:border-amber-400 focus:outline-none"
        />
        <button
          onClick={() => { if (newName.trim()) createSetAndAdd(newName.trim()); }}
          disabled={!newName.trim()}
          className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-700 hover:bg-amber-100 transition-colors disabled:opacity-40"
        >
          Create
        </button>
        <button
          onClick={() => { setCreating(false); setNewName(""); }}
          className="text-zinc-400 hover:text-zinc-600 text-sm"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={panelRef} data-popover-open>
      <button
        onClick={() => setOpen(false)}
        className={`${BUTTON_SIZE} border-amber-300 bg-amber-50 text-amber-700`}
      >
        Add to set
      </button>
      <div className={`absolute left-0 z-20 w-72 rounded-xl border border-zinc-200 bg-white shadow-lg overflow-hidden ${side === "up" ? "bottom-full mb-1" : "top-full mt-1"}`}>
        <ul className="divide-y divide-zinc-100 max-h-56 overflow-y-auto">
          {(sets ?? []).map((s) => {
            const inSet = inSets?.has(s.id);
            return (
              <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2.5">
                <p className="text-sm font-medium text-zinc-900 truncate">{s.name}</p>
                <button
                  disabled={inSet}
                  onClick={() => addToSet(s.id)}
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${inSet ? "bg-green-100 text-green-700 cursor-default" : "bg-amber-500 text-white hover:bg-amber-400"}`}
                >
                  {inSet ? "Added" : "Add"}
                </button>
              </li>
            );
          })}
          <li>
            <button
              onClick={() => setCreating(true)}
              className="w-full text-left px-3 py-2.5 text-sm text-zinc-500 hover:bg-zinc-50 transition-colors"
            >
              + New set…
            </button>
          </li>
        </ul>
      </div>
    </div>
  );
}
