// List prices per million tokens for the models song enrichment calls
// (OpenAI and Anthropic pricing pages, November 2026). Output includes
// reasoning/thinking tokens, which both APIs bill as output.
export const MODEL_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-5.5": { input: 5, output: 30 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

export type TokenUsage = { model: string; input: number; output: number };

// A response's model id can carry a date suffix ("gpt-5.5-2026-04-23"), so
// match the longest known prefix.
export function modelPrice(model: string): { input: number; output: number } | null {
  const key = Object.keys(MODEL_PRICES).filter((k) => model === k || model.startsWith(`${k}-`)).sort((a, b) => b.length - a.length)[0];
  return key ? MODEL_PRICES[key] : null;
}

// Dollars for a run's calls; `unpriced` lists models with no known price.
export function usageCost(usage: TokenUsage[]): { usd: number; unpriced: string[] } {
  let usd = 0;
  const unpriced = new Set<string>();
  for (const u of usage) {
    const p = modelPrice(u.model);
    if (!p) { unpriced.add(u.model); continue; }
    usd += (u.input * p.input + u.output * p.output) / 1_000_000;
  }
  return { usd, unpriced: [...unpriced] };
}
