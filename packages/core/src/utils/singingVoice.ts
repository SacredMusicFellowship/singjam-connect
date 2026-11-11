export const SINGING_LABEL: Record<string, string> = {
  lead: "Lead vocals",
  backup: "Backup vocals",
  none: "Doesn't sing",
};

// Singing-voice badges borrow the confidence colours they line up with: lead
// vocals amber like Lead, backup vocals sky like Support. (Violet is keys.)
export const VOICE_BADGE_STYLES: Record<"lead" | "backup" | "none", { box: string; text: string }> = {
  lead: { box: "bg-amber-50 border-amber-200", text: "text-amber-700" },
  backup: { box: "bg-sky-50 border-sky-200", text: "text-sky-700" },
  none: { box: "bg-zinc-50 border-zinc-200", text: "text-zinc-600" },
};

export function voiceBadgeClass(voice: "lead" | "backup" | null): string {
  const style = VOICE_BADGE_STYLES[voice ?? "none"] ?? VOICE_BADGE_STYLES.none;
  return `${style.box} ${style.text}`;
}

/** Whether a profile's singing_voice (comma-separated) includes lead vocals. */
export function hasLeadVoice(singingVoice: string | null | undefined): boolean {
  return (singingVoice ?? "").split(",").map((v) => v.trim()).includes("lead");
}

// What a profile becomes when someone answers yes to "Do you sing lead?" on
// marking a song Lead.
export const LEAD_VOICE_UPGRADE = "lead,backup";
