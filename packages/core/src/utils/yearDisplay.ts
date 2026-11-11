// Dates on texts and tunes are a year plus a precision (migration 225): exact,
// circa, decade or century ("16th c." is stored as a year in that century).
// The SQL year_span() turns the same pair into the years a filter matches.
export type YearPrecision = "exact" | "circa" | "decade" | "century";

const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${tail}`;
};

// "1719", "c. 1600", "1840s", "16th c."
export function formatYear(year: number | null | undefined, precision?: string | null): string | null {
  if (year == null) return null;
  if (precision === "circa") return `c. ${year}`;
  if (precision === "decade") return `${year - (year % 10)}s`;
  if (precision === "century") return `${ordinal(Math.floor((year - 1) / 100) + 1)} c.`;
  return String(year);
}
