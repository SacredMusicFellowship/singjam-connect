// How a promo code's use count reads on the ticket manager. One use is one
// order, whether it was charged or the code made it free.
export function promoUses(redeemed: number | null): string {
  if (redeemed === null) return "Use count unavailable";
  if (redeemed === 0) return "Not used yet";
  return `Used ${redeemed} ${redeemed === 1 ? "time" : "times"}`;
}
