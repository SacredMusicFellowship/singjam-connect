"use client";

import { useState } from "react";
import ChordsLink from "@/components/ChordsLink";
import { UltimateGuitarIcon } from "@/components/setDetailShared";

// A song's chord chart in a row of controls: the Chords link when there is one
// (marked "unreviewed" until someone other than the person who added it checks
// it); for anyone signed in, the dashed "add chart" button and URL field when
// there isn't. Meant for the end of a flex-wrap row: the URL field takes a line
// of its own beneath it.
export default function ChordChartSlot({
  songId,
  url,
  pending = false,
  canAdd,
  onAdded,
  size = "sm",
}: {
  songId: string;
  url: string | null | undefined;
  pending?: boolean;
  canAdd: boolean;
  onAdded: (url: string) => void;
  size?: "sm" | "md";
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);

  if (url) {
    return (
      <>
        <ChordsLink href={url} size={size} pill />
        {pending && (
          <span title="Added recently — not yet checked by a song editor" className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500">
            unreviewed
          </span>
        )}
      </>
    );
  }

  if (notice) return <span className="text-xs text-zinc-500">{notice}</span>;

  if (!canAdd) return null;

  function close() {
    setAdding(false);
    setInput("");
    setError(null);
  }

  async function save() {
    const next = input.trim();
    if (!next) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/songs/${songId}/charts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: next }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json.error ?? "Couldn't save the chart");
      return;
    }
    close();
    if (json.live) onAdded(next);
    else setNotice("Thanks — a song editor will check it before it replaces the current chart.");
  }

  return (
    <>
      <button
        onClick={() => (adding ? close() : setAdding(true))}
        className={`sm:hidden flex flex-1 max-w-20 items-center justify-center rounded-full border px-3 py-0.5 transition-all ${adding ? "opacity-100 border-zinc-400" : "opacity-50 border-dashed border-zinc-400 hover:opacity-80 hover:border-zinc-500"}`}
        title="Add chord chart"
        aria-label="Add chord chart"
      >
        <UltimateGuitarIcon />
      </button>
      <button
        onClick={() => (adding ? close() : setAdding(true))}
        className={`hidden sm:inline-flex shrink-0 items-center gap-1.5 rounded-full border border-dashed pl-1.5 pr-3 transition-all ${size === "md" ? "py-1.5" : "py-1"} ${adding ? "opacity-100 border-zinc-400" : "opacity-50 border-zinc-400 hover:opacity-80 hover:border-zinc-500"}`}
        title="Add chord chart"
      >
        <UltimateGuitarIcon />
        <span className={`font-medium text-zinc-600 ${size === "md" ? "text-sm" : "text-xs"}`}>Chords</span>
      </button>
      {adding && (
        <div className="basis-full flex items-center gap-2">
          <input
            type="url"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Paste an Ultimate Guitar link…"
            className="flex-1 rounded-xl border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") close(); }}
            autoFocus
          />
          <button
            onClick={save}
            disabled={saving || !input.trim()}
            className="rounded-full bg-amber-500 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-amber-400 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={close} className="text-xs text-zinc-400 hover:text-zinc-600">
            Cancel
          </button>
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      )}
    </>
  );
}
