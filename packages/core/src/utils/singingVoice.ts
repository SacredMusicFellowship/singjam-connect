export const SINGING_LABEL: Record<string, string> = {
  lead: "Lead vocals",
  backup: "Backup vocals",
  none: "Doesn't sing",
};

export function voiceBadgeClass(voice: "lead" | "backup" | null): string {
  if (voice === "lead") return "bg-amber-50 border-amber-200 text-amber-700";
  if (voice === "backup") return "bg-violet-50 border-violet-200 text-violet-700";
  return "bg-zinc-50 border-zinc-200 text-zinc-600";
}

/** Whether a profile's singing_voice (comma-separated) includes lead vocals. */
export function hasLeadVoice(singingVoice: string | null | undefined): boolean {
  return (singingVoice ?? "").split(",").map((v) => v.trim()).includes("lead");
}

// What a profile becomes when someone answers yes to "Do you sing lead?" on
// marking a song Lead.
export const LEAD_VOICE_UPGRADE = "lead,backup";
