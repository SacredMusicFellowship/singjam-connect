// Deterministic randomness, so the same seed always produces the same fake world. Math.random is
// never used: screenshots and tests must not change between runs.

export type Rng = {
  next: () => number;
  int: (min: number, max: number) => number;
  pick: <T>(items: readonly T[]) => T;
  sample: <T>(items: readonly T[], count: number) => T[];
  chance: (probability: number) => boolean;
};

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  // mulberry32
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));

  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error("pick() needs at least one item");
    return items[int(0, items.length - 1)];
  };

  const sample = <T>(items: readonly T[], count: number): T[] => {
    const pool = [...items];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = int(0, i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length));
  };

  const chance = (probability: number) => next() < probability;

  return { next, int, pick, sample, chance };
}

// cyrb128: a fast, well-distributed 128-bit string hash. Used to derive UUIDs from stable keys.
function cyrb128(input: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < input.length; i++) {
    const k = input.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

// A valid v4-shaped UUID that depends only on the key, so a test can refer to "member:host" and
// always get the same row id no matter what else the scenario contains.
export function stableUuid(key: string): string {
  const hex = cyrb128(key).map((n) => n.toString(16).padStart(8, "0")).join("");
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const SHORT_CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

// Same alphabet and length as generate_jam_short_code() / generate_set_short_code() in the
// migrations, but derived from a key so URLs in tests and screenshots are stable.
export function stableShortCode(key: string): string {
  const parts = cyrb128(key);
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += SHORT_CODE_ALPHABET[(parts[i % 4] >>> ((i >> 2) * 8)) % SHORT_CODE_ALPHABET.length];
  }
  return code;
}
