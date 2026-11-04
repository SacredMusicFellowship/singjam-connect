import { MUSICAL_KEYS } from "@singjam/core";

// The key the member plays the song in, shown to their set-mates next to their
// name. A chip like the set list's key (amber once chosen, dashed while empty)
// with the select laid over it invisibly, since phones force selects to 16px.
export default function MyKeySelect({
  value,
  onChange,
  size = "sm",
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={`relative inline-flex shrink-0 items-center gap-1 rounded-full ${
        size === "md" ? "px-3 py-1 text-xs sm:py-1.5 sm:text-sm" : "px-2.5 py-1 text-xs"
      } ${value ? "bg-amber-100 text-amber-800" : "border border-dashed border-zinc-300 text-zinc-500"}`}
    >
      {value ? (
        <>
          <span className="text-amber-700/80">My key</span>
          <span className="font-semibold">{value}</span>
        </>
      ) : (
        "+ My key"
      )}
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="My key"
        className="absolute inset-0 w-full cursor-pointer opacity-0"
      >
        <option value="">No key</option>
        {MUSICAL_KEYS.map((k) => (
          <option key={k} value={k}>{k}</option>
        ))}
      </select>
    </span>
  );
}
