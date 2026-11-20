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
}: {
  value: string;
  onChange: (level: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
  label?: string;
}) {
  const style = confidenceStyle(value);
  return (
    <PillSelect
      face={<StackedLabels labels={CONFIDENCE_LEVEL_OPTIONS.map((l) => ({ key: l.key, label: l.label }))} current={value} />}
      chevron
      pillClassName={`border ${size === "md" ? "px-3 py-1 text-xs sm:py-1.5 sm:text-sm" : "px-2.5 py-1 text-xs"} ${style.control} ${style.controlText} ${
        disabled ? "opacity-40" : ""
      }`}
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
