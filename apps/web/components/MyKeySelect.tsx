import { KEY_STYLE, MUSICAL_KEYS } from "@singjam/core";
import PillSelect, { StackedLabels } from "@/components/PillSelect";

// The key the member plays the song in, shown to their set-mates next to their
// name, in the key colour shared with the set list's key (violet once chosen,
// neutral while empty). Sized for the widest key so the pill never changes width.
export default function MyKeySelect({
  value,
  onChange,
  size = "sm",
  label = "My key",
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  size?: "sm" | "md";
  label?: string;
}) {
  const text = (key: string | null) =>
    key ? (
      <>
        My key <span className="font-semibold">{key}</span>
      </>
    ) : (
      "+ My key"
    );
  return (
    <PillSelect
      face={<StackedLabels center labels={[{ key: "current", label: text(value) }, { key: "widest", label: text("C#") }]} current="current" />}
      pillClassName={`${value ? `${KEY_STYLE.chip} ${KEY_STYLE.text}` : `${KEY_STYLE.emptyChip} ${KEY_STYLE.emptyText}`} ${
        size === "md" ? "px-3 py-1 text-xs sm:py-1.5 sm:text-sm" : "px-2.5 py-1 text-xs"
      }`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={label}
    >
      <option value="">No key</option>
      {MUSICAL_KEYS.map((k) => (
        <option key={k} value={k}>{k}</option>
      ))}
    </PillSelect>
  );
}
