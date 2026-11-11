// The "Hide my songs" checkbox in a song list's toolbar.
export default function HideMySongsToggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="h-7 flex items-center gap-1.5 rounded-lg border border-zinc-200 px-3 text-xs font-medium text-zinc-500 cursor-pointer select-none hover:bg-zinc-50 transition-colors whitespace-nowrap">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="rounded border-zinc-300 accent-amber-500"
      />
      Hide my songs
    </label>
  );
}
