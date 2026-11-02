"use client";

import { useEffect, useState } from "react";
import { PERSONAL_SONG_NOTES_MAX } from "@singjam/core";
import { supabaseBrowser } from "@/lib/supabase/client";

// A member's private notes on a song in their repertoire (user_song_notes,
// readable only by them).
export default function MySongNotes({ songId, userId }: { songId: string; userId: string }) {
  const supabase = supabaseBrowser();
  const [notes, setNotes] = useState<string | null>(null);
  const [savedNotes, setSavedNotes] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("user_song_notes")
      .select("notes")
      .eq("user_id", userId)
      .eq("song_id", songId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setNotes(data?.notes ?? "");
        setSavedNotes(data?.notes ?? "");
      });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, userId]);

  async function saveNotes() {
    const next = (notes ?? "").trim();
    if (next === savedNotes) return;
    setStatus("saving");
    const { error } = next
      ? await supabase.from("user_song_notes").upsert({ user_id: userId, song_id: songId, notes: next, updated_at: new Date().toISOString() })
      : await supabase.from("user_song_notes").delete().eq("user_id", userId).eq("song_id", songId);
    if (error) { setStatus("error"); return; }
    setSavedNotes(next);
    setNotes(next);
    setStatus("saved");
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">My notes</h2>
      {notes === null ? (
        <div className="h-20 animate-pulse rounded-lg bg-slate-100" />
      ) : (
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); setStatus("idle"); }}
          onBlur={saveNotes}
          maxLength={PERSONAL_SONG_NOTES_MAX}
          rows={3}
          placeholder="Capo, strumming, the bridge you always forget…"
          aria-label="My notes"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400"
        />
      )}
      <p className="text-xs text-slate-400">
        {status === "saving" ? "Saving…" : status === "saved" ? "Saved. Only you can see your notes." : status === "error" ? "Couldn't save. Try again." : "Only you can see your notes."}
      </p>
    </section>
  );
}
