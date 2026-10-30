"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setPath } from "@singjam/core";

type LinkedSet = { id: string; short_code?: string | null; name: string };
type OwnedSet = { id: string; name: string };

export default function JamSetList({ jamId, jamName, canManage }: { jamId: string; jamName: string | null; canManage: boolean }) {
  const router = useRouter();
  const [set, setSet] = useState<LinkedSet | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [availableSets, setAvailableSets] = useState<OwnedSet[] | null>(null);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [linkingInProgress, setLinkingInProgress] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  useEffect(() => {
    fetch(`/api/jam/${jamId}/set`)
      .then((r) => r.json())
      .then(({ set }) => setSet(set ?? null));
  }, [jamId]);

  async function handleCreate() {
    setCreating(true);
    const name = jamName ? `${jamName} – set list` : "Set list";
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, jamId }),
    });
    router.push(setPath(await res.json()));
  }

  async function handleShowLink() {
    setLinking(true);
    if (!availableSets) {
      const res = await fetch("/api/sets");
      const { owned, collaborating } = await res.json();
      setAvailableSets([...(owned as OwnedSet[]), ...(collaborating as OwnedSet[])]);
    }
  }

  async function handleUnlink() {
    const prev = set;
    setSet(null);
    const res = await fetch(`/api/jam/${jamId}/set`, { method: "DELETE" });
    if (!res.ok) setSet(prev);
  }

  async function handleLink() {
    if (!selectedSetId) return;
    const linked = availableSets?.find((s) => s.id === selectedSetId);
    if (!linked) return;
    setSet({ id: linked.id, name: linked.name });
    setLinking(false);
    setLinkingInProgress(true);
    const res = await fetch(`/api/jam/${jamId}/set`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId: selectedSetId }),
    });
    if (!res.ok) {
      setSet(null);
      setLinking(true);
    }
    setLinkingInProgress(false);
  }

  if (set === undefined) return null;
  if (!canManage && !set) return null;

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 space-y-3">
      <h2 className="text-base font-semibold">Set list</h2>
      {set ? (
        <div className="flex items-center gap-2">
          <a
            href={`/set/${set.short_code ?? set.id}`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            {set.name}
            <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
          {canManage && (
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="inline-flex items-center rounded-xl border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
            >
              {unlinking ? "Unlinking…" : "Unlink"}
            </button>
          )}
        </div>
      ) : linking ? (
        <div className="space-y-2">
          {availableSets === null ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : availableSets.length === 0 ? (
            <p className="text-sm text-zinc-500">No set lists found.</p>
          ) : (
            <select
              value={selectedSetId}
              onChange={(e) => setSelectedSetId(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm text-zinc-700 bg-white"
            >
              <option value="">Choose a set list…</option>
              {availableSets.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <button
              onClick={handleLink}
              disabled={!selectedSetId || linkingInProgress}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {linkingInProgress ? "Linking…" : "Link set list"}
            </button>
            <button
              onClick={() => setLinking(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-zinc-500">
            Create a set list for this jam — attendees will be added as collaborators automatically.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create set list"}
            </button>
            <button
              onClick={handleShowLink}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Link existing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
