"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Level = "lead" | "support" | "learn";

const LEVELS: { key: Level; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "support", label: "Support" },
  { key: "learn", label: "Learn" },
];

export default function ConfidencePicker({
  singingVoice,
  saving = false,
  onSave,
  onCancel,
  onVoiceUpdated,
  variant = "card",
  initialAskVoice = false,
  songTitle,
  offerLearn = true,
}: {
  singingVoice: string | null;
  saving?: boolean;
  onSave: (level: Level) => void | Promise<void>;
  onCancel: () => void;
  onVoiceUpdated?: (voice: string) => void;
  variant?: "compact" | "card";
  initialAskVoice?: boolean;
  songTitle?: string;
  /** False after "I know this song!": learning has its own "Want to learn it" link. */
  offerLearn?: boolean;
}) {
  const supabase = supabaseBrowser();
  const [localVoice, setLocalVoice] = useState(singingVoice);
  const [askingVoice, setAskingVoice] = useState(initialAskVoice);
  const [savingVoice, setSavingVoice] = useState(false);

  useEffect(() => { setLocalVoice(singingVoice); }, [singingVoice]);

  const isBlocked = (level: Level) =>
    level === "lead" && !localVoice?.split(",").includes("lead");

  async function handleVoiceConfirm() {
    setSavingVoice(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      await supabase.from("profiles").update({ singing_voice: "lead,backup" }).eq("id", session.user.id);
      setLocalVoice("lead,backup");
      onVoiceUpdated?.("lead,backup");
    }
    setSavingVoice(false);
    setAskingVoice(false);
    await onSave("lead");
  }

  const isCompact = variant === "compact";
  const card = `${isCompact ? "rounded-xl p-3 space-y-2" : "rounded-2xl p-4 space-y-2.5"} border border-indigo-300 bg-indigo-50 animate-attention-pop`;
  const heading = isCompact ? "text-xs font-semibold text-indigo-900" : "text-sm font-semibold text-indigo-900";
  const wrap = isCompact ? "flex flex-wrap items-center gap-1.5" : "flex flex-wrap items-center gap-2";

  if (askingVoice) {
    return (
      <div className={card}>
        <p className={heading}>Can you sing?</p>
        <div className={wrap}>
          <button
            disabled={savingVoice}
            onClick={handleVoiceConfirm}
            className={isCompact
              ? "rounded-full px-2 py-1.5 text-xs bg-amber-100 text-amber-800 hover:opacity-80 transition-opacity disabled:opacity-50"
              : "rounded-xl border border-amber-400 bg-amber-50 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
            }
          >
            Yes
          </button>
          <button
            disabled={savingVoice}
            onClick={() => setAskingVoice(false)}
            className={isCompact
              ? "text-xs text-zinc-500 hover:text-zinc-700 disabled:opacity-50"
              : "rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-sm text-zinc-500 hover:bg-indigo-100 disabled:opacity-50"
            }
          >
            Not now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={card}>
      <p className={heading}>
        {songTitle ? (
          <>How well do you know <span className="font-bold">{songTitle}</span>?</>
        ) : (
          "How well do you know this song?"
        )}
      </p>
      <div className={wrap}>
        {LEVELS.filter((l) => offerLearn || l.key !== "learn").map(({ key, label }) => {
          const blocked = isBlocked(key);
          return (
            <button
              key={key}
              disabled={saving}
              onClick={async () => {
                if (blocked) { setAskingVoice(true); return; }
                await onSave(key);
              }}
              className={isCompact
                ? `rounded-full px-2 py-1.5 text-xs transition-opacity disabled:opacity-50 ${
                    blocked
                      ? "bg-white text-zinc-400"
                      : key === "lead"
                      ? "bg-amber-100 text-amber-800 font-semibold hover:opacity-80"
                      : key === "support"
                      ? "bg-white text-zinc-700 hover:opacity-80"
                      : "bg-white text-zinc-500 hover:opacity-80"
                  }`
                : `rounded-xl border px-3 py-1.5 text-sm transition-colors disabled:opacity-40 ${
                    blocked
                      ? "border-zinc-200 bg-white text-zinc-400"
                      : key === "lead"
                      ? "border-amber-400 bg-amber-50 text-amber-700 hover:bg-amber-100"
                      : "border-indigo-200 bg-white text-zinc-700 hover:bg-indigo-100"
                  }`
              }
            >
              {label}
            </button>
          );
        })}
        <button
          onClick={onCancel}
          className={isCompact
            ? "text-xs text-zinc-500 hover:text-zinc-700"
            : "rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-sm text-zinc-500 hover:bg-indigo-100"
          }
        >
          {isCompact ? "Cancel" : "✕"}
        </button>
      </div>
    </div>
  );
}
