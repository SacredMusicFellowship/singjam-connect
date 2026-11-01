"use client";

import { hasLeadVoice } from "@singjam/core";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import ConfidencePicker from "@/components/ConfidencePicker";

type Level = "lead" | "support" | "learn";

const LEVELS: { key: Level; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "support", label: "Support" },
  { key: "learn", label: "Learn" },
];

export default function RepertoireButton({
  songId,
  initialConfidence,
  singingVoice = null,
  onConfidenceChange,
  children,
}: {
  songId: string;
  initialConfidence: string | null;
  singingVoice?: string | null;
  onConfidenceChange?: (level: string | null) => void;
  children?: React.ReactNode;
}) {
  const supabase = supabaseBrowser();
  const router = useRouter();
  const [confidence, setConfidence] = useState(initialConfidence);
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [voiceCheckPending, setVoiceCheckPending] = useState(false);

  useEffect(() => {
    setConfidence(initialConfidence);
    setPicking(false);
  }, [initialConfidence]);

  async function getSession() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { router.push(`/auth?next=${encodeURIComponent(window.location.pathname)}`); return null; }
    return data.session;
  }

  async function save(level: Level) {
    setSaving(true);
    const session = await getSession();
    if (!session) return;

    const { error } = await supabase.from("user_songs").upsert(
      {
        user_id: session.user.id,
        song_id: songId,
        confidence: level,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,song_id" }
    );

    setSaving(false);
    if (!error) {
      setConfidence(level);
      onConfidenceChange?.(level);
      setPicking(false);
      router.refresh();
    }
  }

  async function remove() {
    setSaving(true);
    const session = await getSession();
    if (!session) return;

    const { error } = await supabase
      .from("user_songs")
      .delete()
      .eq("user_id", session.user.id)
      .eq("song_id", songId);

    setSaving(false);
    if (!error) {
      setConfidence(null);
      onConfidenceChange?.(null);
      router.refresh();
    }
  }

  if (picking) {
    return (
      <ConfidencePicker
        singingVoice={singingVoice}
        saving={saving}
        initialAskVoice={voiceCheckPending}
        offerLearn={false}
        onSave={(level) => { save(level); setVoiceCheckPending(false); }}
        onCancel={() => { setPicking(false); setVoiceCheckPending(false); }}
      />
    );
  }

  if (confidence !== null) {
    return (
      <div className="relative flex flex-wrap items-center gap-2">
        <select
          value={confidence}
          disabled={saving}
          onChange={(e) => {
            if (e.target.value === "lead" && !hasLeadVoice(singingVoice)) {
              setVoiceCheckPending(true);
              setPicking(true);
            } else {
              save(e.target.value as Level);
            }
          }}
          className={`rounded-xl border px-2 py-1.5 text-sm disabled:opacity-40 ${
            confidence === "lead"
              ? "border-amber-400 bg-amber-100 text-amber-800 font-semibold"
              : "border-slate-300"
          }`}
          aria-label="Role"
        >
          {LEVELS.map((l) => (
            <option key={l.key} value={l.key}>{l.label}</option>
          ))}
        </select>
        {children}
        <button
          onClick={remove}
          disabled={saving}
          className="rounded-xl border border-zinc-200 px-2 py-1 text-xs text-zinc-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
        >
          Remove
        </button>
      </div>
    );
  }

  async function handleAddClick() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { router.push(`/auth?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setPicking(true);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handleAddClick}
        className="rounded-xl bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 transition-colors"
      >
        I know this song!
      </button>
      <button
        onClick={() => save("learn")}
        disabled={saving}
        className="text-sm text-indigo-600 hover:underline disabled:opacity-50"
      >
        Want to learn it
      </button>
    </div>
  );
}
