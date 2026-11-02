import { MUSICAL_KEYS } from "@singjam/core";

// The key the member plays the song in, shown to their set-mates next to their name.
export default function MyKeySelect({ value, onChange }: { value: string | null; onChange: (key: string | null) => void }) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className={`rounded-xl border px-2 py-1.5 text-xs sm:text-sm ${
        value ? "border-amber-200 bg-amber-50 text-amber-800" : "border-zinc-200"
      }`}
      aria-label="My key"
    >
      <option value="">My key</option>
      {MUSICAL_KEYS.map((k) => (
        <option key={k} value={k}>My key: {k}</option>
      ))}
    </select>
  );
}
