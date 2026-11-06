"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setPath } from "@singjam/core";
import Select from "@/components/Select";

type LinkedSet = { id: string; short_code?: string | null; name: string };
type OwnedSet = { id: string; name: string; jam_id?: string | null; jam_name?: string | null };

export default function JamSetList({ jamId, jamName, canManage }: { jamId: string; jamName: string | null; canManage: boolean }) {
  const router = useRouter();
  const [set, setSet] = useState<LinkedSet | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);
  const [linking, setLinking] = useState(false);
  const [availableSets, setAvailableSets] = useState<OwnedSet[] | null>(null);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [linkingInProgress, setLinkingInProgress] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [confirmMove, setConfirmMove] = useState<OwnedSet | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);

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

  async function putLink(setId: string, move: boolean) {
    const res = await fetch(`/api/jam/${jamId}/set`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ setId, move }),
    });
    if (res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return (body.error as string) ?? "Couldn't link that set list. Please try again.";
  }

  async function handleLink(mode: "link" | "move" | "copy") {
    const chosen = availableSets?.find((s) => s.id === selectedSetId);
    if (!chosen) return;
    if (mode === "link" && chosen.jam_id && chosen.jam_id !== jamId) {
      setConfirmMove(chosen);
      return;
    }
    setLinkError(null);
    setLinkingInProgress(true);

    let target: LinkedSet = { id: chosen.id, name: chosen.name };
    if (mode === "copy") {
      const res = await fetch(`/api/sets/${chosen.id}/copy`, { method: "POST" });
      if (!res.ok) {
        setLinkError("Couldn't copy that set list. Please try again.");
        setLinkingInProgress(false);
        return;
      }
      const copy = await res.json();
      target = { id: copy.id, short_code: copy.short_code, name: `Copy of ${chosen.name}` };
    }

    const error = await putLink(target.id, mode === "move");
    setLinkingInProgress(false);
    if (error) {
      setLinkError(error);
      return;
    }
    setConfirmMove(null);
    setLinking(false);
    setAvailableSets(null);
    setSelectedSetId("");
    setSet(target);
  }

  function cancelLinking() {
    setLinking(false);
    setConfirmMove(null);
    setLinkError(null);
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
            title={set.name}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <span className="truncate">{set.name}</span>
            <svg className="h-4 w-4 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>
          {canManage && (
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="inline-flex shrink-0 items-center rounded-full border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
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
            <Select
              value={selectedSetId}
              onChange={(e) => { setSelectedSetId(e.target.value); setConfirmMove(null); setLinkError(null); }}
              wrapperClassName="w-full"
            >
              <option value="">Choose a set list…</option>
              {availableSets.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.jam_id && s.jam_id !== jamId ? `${s.name} (linked to ${s.jam_name ?? "another jam"})` : s.name}
                </option>
              ))}
            </Select>
          )}
          {confirmMove ? (
            <div className="space-y-3 rounded-xl bg-zinc-50 p-3">
              <p className="text-sm text-zinc-600">
                <span className="font-medium text-zinc-900">{confirmMove.name}</span> is already the set list for{" "}
                {confirmMove.jam_name ? <span className="font-medium text-zinc-900">{confirmMove.jam_name}</span> : "another jam"}.
                A set list can only belong to one jam, so moving it here removes it from that one. A copy keeps both.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => handleLink("copy")}
                  disabled={linkingInProgress}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
                >
                  {linkingInProgress ? "Linking…" : "Link a copy"}
                </button>
                <button
                  onClick={() => handleLink("move")}
                  disabled={linkingInProgress}
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                >
                  Move it here
                </button>
                <button
                  onClick={() => setConfirmMove(null)}
                  disabled={linkingInProgress}
                  className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100 disabled:opacity-50 transition-colors"
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => handleLink("link")}
                disabled={!selectedSetId || linkingInProgress}
                className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
              >
                {linkingInProgress ? "Linking…" : "Link set list"}
              </button>
              <button
                onClick={cancelLinking}
                className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
          {linkError && <p className="text-sm text-red-600">{linkError}</p>}
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
              className="inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {creating ? "Creating…" : "Create set list"}
            </button>
            <button
              onClick={handleShowLink}
              className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Link existing
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
