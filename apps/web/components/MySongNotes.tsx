"use client";

import { useEffect, useRef, useState } from "react";
import { PERSONAL_SONG_NOTES_MAX } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

// A member's private notes on a song in their repertoire (user_song_notes,
// readable only by them). Same add / view / edit pattern as set-song notes.
export default function MySongNotes({ songId, userId, className = "" }: { songId: string; userId: string; className?: string }) {
  const supabase = supabaseBrowser();
  const [notes, setNotes] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState(false);
  // Set when Cancel closes the editor, so the textarea's blur doesn't save.
  const discardRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("user_song_notes")
      .select("notes")
      .eq("user_id", userId)
      .eq("song_id", songId)
      .maybeSingle()
      .then(({ data }) => { if (!cancelled) setNotes(data?.notes ?? ""); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, userId]);

  function startEditing() {
    discardRef.current = false;
    setError(false);
    setInput(notes ?? "");
    setEditing(true);
  }

  function cancel() {
    discardRef.current = true;
    setEditing(false);
  }

  async function save(value: string = input) {
    if (discardRef.current) return;
    discardRef.current = true;
    const next = value.trim();
    setEditing(false);
    if (next === (notes ?? "")) return;
    const prev = notes;
    setNotes(next);
    const { error } = next
      ? await supabase.from("user_song_notes").upsert({ user_id: userId, song_id: songId, notes: next, updated_at: new Date().toISOString() })
      : await supabase.from("user_song_notes").delete().eq("user_id", userId).eq("song_id", songId);
    if (error) { setNotes(prev); setError(true); }
  }

  if (notes === null) return <div className={`h-6 w-24 animate-pulse rounded-full bg-slate-100 ${className}`} />;

  if (editing) {
    return (
      <div className={`max-w-md space-y-1.5 ${className}`}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => save()}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); }
            if (e.key === "Escape") cancel();
          }}
          maxLength={PERSONAL_SONG_NOTES_MAX}
          rows={2}
          placeholder="Capo, strumming, the bridge you always forget…"
          aria-label="My notes"
          autoFocus
          className="w-full rounded-xl border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
        {/* onMouseDown keeps the textarea from blurring (and saving) before the click lands. */}
        <div className="flex items-center gap-2">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => save()}
            className="rounded-full bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-400 transition-colors"
          >
            Save
          </button>
          <button onMouseDown={(e) => e.preventDefault()} onClick={cancel} className="text-xs text-zinc-500 hover:text-zinc-700">
            Cancel
          </button>
          {notes && (
            <button onMouseDown={(e) => e.preventDefault()} onClick={() => save("")} className="text-xs text-zinc-400 hover:text-red-500">
              Remove note
            </button>
          )}
          <span className="ml-auto text-[10px] text-zinc-400">Only you can see this · {input.length}/{PERSONAL_SONG_NOTES_MAX}</span>
        </div>
      </div>
    );
  }

  if (notes) {
    return (
      <div className={`flex max-w-md items-start gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 ${className}`}>
        <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
        <p className="flex-1 min-w-0 whitespace-pre-wrap break-words text-sm text-zinc-700">{notes}</p>
        <button onClick={startEditing} className="shrink-0 text-xs font-medium text-amber-600 hover:text-amber-500">
          Edit
        </button>
        {error && <span className="shrink-0 text-xs text-red-500">Couldn&apos;t save.</span>}
      </div>
    );
  }

  return (
    <div className={className}>
      <button
        onClick={startEditing}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-zinc-300 px-2.5 py-0.5 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-700 transition-colors"
      >
        + Add note
      </button>
      {error && <span className="ml-2 text-xs text-red-500">Couldn&apos;t save. Try again.</span>}
    </div>
  );
}
