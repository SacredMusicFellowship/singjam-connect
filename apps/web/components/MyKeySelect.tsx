import { MUSICAL_KEYS } from "@singjam/core";

// The key the member plays the song in, shown to their set-mates next to their
// name. Styled like the pills beside it (thin border, white) so it doesn't read
// as Lead's amber. Every possible label sits in one grid cell with only the
// current one visible, so the pill keeps one width whatever the key. The select
// lies over it invisibly, since phones force selects to 16px.
export default function MyKeySelect({
  value,
  onChange,
  size = "sm",
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  size?: "sm" | "md";
}) {
  const label = (key: string | null) =>
    key ? (
      <>
        My key <span className="font-semibold text-zinc-900">{key}</span>
      </>
    ) : (
      "+ My key"
    );
  return (
    <span
      className={`relative inline-flex shrink-0 items-center rounded-full border border-zinc-200 bg-white text-zinc-600 ${
        size === "md" ? "px-3 py-1 text-xs sm:py-1.5 sm:text-sm" : "px-2.5 py-1 text-xs"
      }`}
    >
      <span className="grid justify-items-center">
        <span className="col-start-1 row-start-1">{label(value)}</span>
        <span className="invisible col-start-1 row-start-1" aria-hidden="true">{label("C#")}</span>
      </span>
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
