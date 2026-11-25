"use client";

import { CONFIDENCE_LEVEL_OPTIONS, confidenceStyle } from "@singjam/core";
import PillSelect, { StackedLabels } from "@/components/PillSelect";

// The member's own Lead / Support / Learn for a song, coloured by level.
export default function RoleSelect({
  value,
  onChange,
  disabled = false,
  size = "sm",
  label = "Role",
  fill = false,
}: {
  value: string;
  onChange: (level: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
  // In a row of song actions: on phones, share the row's spare width with the other pills.
  fill?: boolean;
}) {
  const style = confidenceStyle(value);
  return (
    <PillSelect
      face={<StackedLabels labels={CONFIDENCE_LEVEL_OPTIONS.map((l) => ({ key: l.key, label: l.label }))} current={value} />}
      chevron
      pillClassName={`border ${size === "md" ? `${fill ? "px-2.5 sm:px-3" : "px-3"} py-1 text-xs sm:py-1.5 sm:text-sm` : "px-2.5 py-1 text-xs"} ${style.control} ${style.controlText} ${
        disabled ? "opacity-40" : ""
      } ${fill ? "justify-center max-sm:grow" : ""}`}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      {CONFIDENCE_LEVEL_OPTIONS.map((l) => (
        <option key={l.key} value={l.key}>{l.label}</option>
      ))}
    </PillSelect>
  );
}
