"use client";

import { useState } from "react";
import ChordsLink from "@/components/ChordsLink";
import { UltimateGuitarIcon } from "@/components/setDetailShared";

// A song's chord chart in a row of controls: the Chords link when there is one;
// for admins and song editors, the set list's dashed "add chart" button and URL
// field when there isn't; otherwise nothing. Meant for the end of a flex-wrap
// row: the URL field takes a line of its own beneath it.
export default function ChordChartSlot({
  songId,
  url,
  canAdd,
  onAdded,
  size = "sm",
}: {
  songId: string;
  url: string | null | undefined;
  canAdd: boolean;
  onAdded: (url: string) => void;
  size?: "sm" | "md";
}) {
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (url) return <ChordsLink href={url} size={size} />;

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
    const res = await fetch(`/api/songs/${songId}/media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chord_chart_url: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Couldn't save the chart");
      return;
    }
    onAdded(next);
    close();
  }

  return (
    <>
      <button
        onClick={() => (adding ? close() : setAdding(true))}
        className={`sm:hidden rounded-lg p-1.5 transition-all ${adding ? "opacity-100" : "opacity-50 border border-dashed border-zinc-400 hover:opacity-80 hover:border-zinc-500"}`}
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
            placeholder="Paste chord chart URL…"
            className="flex-1 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
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
