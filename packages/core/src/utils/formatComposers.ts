export function formatComposers(composers: string[], cultures: string[]): string {
  const isTraditional = composers.some((c) => c.toLowerCase() === "traditional");
  const others = composers.filter((c) => c.toLowerCase() !== "traditional");
  const parts: string[] = [];
  if (isTraditional) {
    const uniqueCultures = [...new Set(cultures)];
    parts.push(uniqueCultures.length ? `Trad. · ${uniqueCultures.join(", ")}` : "Trad.");
  }
  parts.push(
    ...others.map((name) => {
      const w = name.trim().split(" ");
      return w.length > 1 ? `${w[0][0]}. ${w.slice(1).join(" ")}` : name;
    })
  );
  return parts.join(", ");
}

// The song detail pages spell names out in full rather than abbreviating them,
// and name a single culture for "Traditional" instead of listing every one.
export function formatComposersLong(names: string[], cultures: string[]): string {
  const isTraditional = names.some((n) => n.toLowerCase() === "traditional");
  const others = names.filter((n) => n.toLowerCase() !== "traditional");
  const parts: string[] = [];
  if (isTraditional) {
    const culture = cultures[0];
    parts.push(culture ? `Traditional · ${culture}` : "Traditional");
  }
  parts.push(...others);
  return parts.join(", ");
}

export function sortByLastName(names: string[]): string[] {
  const lastName = (n: string) => n.trim().split(/\s+/).at(-1) ?? "";
  return [...names].sort((a, b) => lastName(a).localeCompare(lastName(b)));
}
