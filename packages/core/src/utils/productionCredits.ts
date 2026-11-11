export type ProductionCredit = { name: string; year: number | null; slug?: string | null };

// Rows cached before production_credits existed carry only the names.
export function productionCredits(
  credits: ProductionCredit[] | null | undefined,
  names: string[] | null | undefined,
): ProductionCredit[] {
  if (credits?.length) return credits;
  return (names ?? []).map((name) => ({ name, year: null }));
}
