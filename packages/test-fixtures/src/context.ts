import { FIXED_NOW } from "./constants";
import { createRng, stableShortCode, stableUuid, type Rng } from "./random";

export type FixtureContext = {
  rng: Rng;
  now: Date;
  id: (kind: string, key: string | number) => string;
  shortCode: (kind: string, key: string | number) => string;
  // An ISO timestamp `days` from now. With `pacificHour`, it lands at that local hour in
  // America/Los_Angeles (fixtures use summer time, UTC-7).
  at: (days: number, pacificHour?: number, minute?: number) => string;
};

export function createContext(seed: number, now: Date = FIXED_NOW): FixtureContext {
  const rng = createRng(seed);
  // Ids depend on the seed too, so two scenarios with different seeds never collide in one database.
  const id = (kind: string, key: string | number) => stableUuid(`${seed}:${kind}:${key}`);
  const shortCode = (kind: string, key: string | number) => stableShortCode(`${seed}:${kind}:${key}`);
  const at = (days: number, pacificHour?: number, minute = 0) => {
    const d = new Date(now.getTime() + days * 86_400_000);
    if (pacificHour !== undefined) {
      d.setUTCHours(pacificHour + 7, minute, 0, 0);
    }
    return d.toISOString();
  };
  return { rng, now, id, shortCode, at };
}
