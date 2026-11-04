"use client";

import { CONFIDENCE_LEVEL_OPTIONS, confidenceLabel, confidenceStyle } from "@singjam/core";

// The member's own Lead / Support / Learn for a song, coloured by level. A
// visible pill with the real select laid over it invisibly: phones force selects
// to 16px (globals.css), which made the bare select far bigger than its row.
export default function RoleSelect({
  value,
  onChange,
  disabled = false,
  size = "sm",
}: {
  value: string;
  onChange: (level: string) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const style = confidenceStyle(value);
  return (
    <span
      className={`relative inline-flex shrink-0 items-center gap-1 rounded-full border ${
        size === "md" ? "px-3 py-1 text-xs sm:py-1.5 sm:text-sm" : "px-2.5 py-1 text-xs"
      } ${style.control} ${style.controlText} ${disabled ? "opacity-40" : ""}`}
    >
      {confidenceLabel(value)}
      <svg className="h-3 w-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
      </svg>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Role"
        className="absolute inset-0 w-full cursor-pointer opacity-0 disabled:cursor-default"
      >
        {CONFIDENCE_LEVEL_OPTIONS.map((l) => (
          <option key={l.key} value={l.key}>{l.label}</option>
        ))}
      </select>
    </span>
  );
}
