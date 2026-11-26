import { KEY_MODE_OPTIONS, KEY_STYLE, MUSICAL_KEYS, keyMode, keyWithMode, type KeyMode } from "@singjam/core";
import PillSelect, { StackedLabels } from "@/components/PillSelect";

// The key the member plays the song in, shown to their set-mates next to their
// name, in the key colour shared with the set list's key (violet once chosen,
// neutral while empty). With the song's mode as a chord chart writes it: "Key Am" on a
// phone, so the row of song actions stays on one line, and "My key Am" from sm up. Sized for the
// widest key in the widest mode, so the pill is one width on every song and the
// row's buttons line up from song to song. On phones it shares the row's spare
// width with Role and Add to set.
export default function MyKeySelect({
  value,
  onChange,
  tonality,
  size = "sm",
  label = "My key",
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  tonality?: string | null;
  size?: "sm" | "md";
  label?: string;
}) {
  const text = (key: string | null, mode: KeyMode | null) =>
    key ? (
      <>
        <span className="sm:hidden">Key</span>
        <span className="hidden sm:inline">My key</span>{" "}
        <span className="font-semibold">{keyWithMode(key, mode, "short")}</span>
      </>
    ) : (
      "+ My key"
    );
  return (
    <PillSelect
      face={
        <StackedLabels
          center
          labels={[{ key: "current", label: text(value, keyMode(tonality)) }, ...KEY_MODE_OPTIONS.map((m) => ({ key: m.full, label: text("C#", m) }))]}
          current="current"
        />
      }
      pillClassName={`justify-center max-sm:grow ${value ? `${KEY_STYLE.chip} ${KEY_STYLE.text}` : `${KEY_STYLE.emptyChip} ${KEY_STYLE.emptyText}`} ${
        size === "md" ? "px-2.5 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm" : "px-2.5 py-1 text-xs"
      }`}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      aria-label={label}
    >
      <option value="">No key</option>
      {MUSICAL_KEYS.map((k) => (
        <option key={k} value={k}>{keyWithMode(k, keyMode(tonality), "full")}</option>
      ))}
    </PillSelect>
  );
}
