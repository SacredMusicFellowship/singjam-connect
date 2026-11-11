export type ConfidenceLevel = "lead" | "support" | "learn";

export const CONFIDENCE_LEVEL_OPTIONS: readonly { key: ConfidenceLevel; label: string }[] = [
  { key: "lead", label: "Lead" },
  { key: "support", label: "Support" },
  { key: "learn", label: "Learn" },
];

type ConfidenceStyle = {
  /** Small "Lead" / "Support" / "Learning" row label. */
  label: string;
  /** A person's name pill: background, then text. */
  pill: string;
  pillText: string;
  /** Your own Role control: border and background, then text. */
  control: string;
  controlText: string;
  /** Hex for icons drawn outside Tailwind (native chevrons). */
  icon: string;
};

// One colour per confidence level, everywhere in both apps: Lead amber,
// Support sky, Learn neutral. Green is kept for Played/Going and indigo for
// "add this song", so neither is used here. Tailwind class names only, so web
// and NativeWind both read them; both apps' Tailwind configs scan this file.
export const CONFIDENCE_STYLES: Record<ConfidenceLevel, ConfidenceStyle> = {
  lead: {
    label: "text-amber-500",
    pill: "bg-amber-100",
    pillText: "text-amber-700",
    control: "border-amber-400 bg-amber-100",
    controlText: "text-amber-800 font-semibold",
    icon: "#92400e",
  },
  support: {
    label: "text-sky-500",
    pill: "bg-sky-100",
    pillText: "text-sky-700",
    control: "border-sky-300 bg-sky-50",
    controlText: "text-sky-800 font-medium",
    icon: "#075985",
  },
  learn: {
    label: "text-zinc-400",
    pill: "bg-zinc-100",
    pillText: "text-zinc-600",
    control: "border-zinc-300 bg-zinc-50",
    controlText: "text-zinc-700 font-medium",
    icon: "#52525b",
  },
};

/** Styles for a stored confidence value; anything unrecognised reads as Learn. */
export function confidenceStyle(level: string | null | undefined): ConfidenceStyle {
  return CONFIDENCE_STYLES[(level ?? "") as ConfidenceLevel] ?? CONFIDENCE_STYLES.learn;
}

export function confidenceLabel(level: string | null | undefined): string {
  return CONFIDENCE_LEVEL_OPTIONS.find((l) => l.key === level)?.label ?? "Learn";
}
