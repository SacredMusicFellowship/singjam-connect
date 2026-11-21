"use client";

import { hasLeadVoice } from "@singjam/core";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import RoleSelect from "@/components/RoleSelect";
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
  knownTune = null,
  children,
}: {
  songId: string;
  initialConfidence: string | null;
  singingVoice?: string | null;
  onConfidenceChange?: (level: string | null) => void;
  // The viewer's Lead/Support song sung to this tune (song_melodies, migration 220).
  knownTune?: { title: string; slug: string | null } | null;
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
        <RoleSelect
          value={confidence}
          disabled={saving}
          size="md"
          onChange={(level) => {
            if (level === "lead" && !hasLeadVoice(singingVoice)) {
              setVoiceCheckPending(true);
              setPicking(true);
            } else {
              save(level as Level);
            }
          }}
        />
        {children}
      </div>
    );
  }

  async function handleAddClick() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { router.push(`/auth?next=${encodeURIComponent(window.location.pathname)}`); return; }
    setPicking(true);
  }

  function addAsLead() {
    if (!hasLeadVoice(singingVoice)) {
      setVoiceCheckPending(true);
      setPicking(true);
    } else {
      save("lead");
    }
  }

  return (
    <div className="flex flex-col gap-2">
    {knownTune && (
      <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <span>
          You know the tune from{" "}
          {knownTune.slug ? (
            <Link href={`/songs/${knownTune.slug}`} className="font-medium hover:text-amber-700 hover:underline">{knownTune.title}</Link>
          ) : (
            <span className="font-medium">{knownTune.title}</span>
          )}
        </span>
        <button
          onClick={addAsLead}
          disabled={saving}
          className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800 hover:bg-amber-200 transition-colors disabled:opacity-50"
        >
          Add as Lead
        </button>
      </p>
    )}
    <div className="flex flex-wrap items-center gap-3">
      <button
        onClick={handleAddClick}
        className="rounded-full bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-400 transition-colors"
      >
        I know this song!
      </button>
      <button
        onClick={() => save("learn")}
        disabled={saving}
        className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 hover:bg-indigo-50 transition-colors disabled:opacity-50"
      >
        Want to learn it
      </button>
    </div>
    </div>
  );
}
