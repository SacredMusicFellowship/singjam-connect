/**
 * Sends one request per key at a time. A request made while one is in flight
 * for the same key waits, and a newer one replaces it, so only the latest tap
 * is sent after the current one and the server applies them in tap order.
 * `onSettled` runs once the last request for a key finishes (null if it threw),
 * and `isPending(key)` stays true until then, so live updates arriving
 * meanwhile can be told apart from the user's newer choice.
 */
export interface LatestWinsQueue {
  run<T>(key: string, task: () => Promise<T>, onSettled: (result: T | null) => void): void;
  isPending(key: string): boolean;
}

type Job = { task: () => Promise<unknown>; onSettled: (result: unknown) => void };

export function createLatestWinsQueue(): LatestWinsQueue {
  const waiting = new Map<string, Job | null>();

  function start(key: string, job: Job) {
    job.task()
      .catch(() => null)
      .then((result) => {
        const next = waiting.get(key);
        if (next) {
          waiting.set(key, null);
          start(key, next);
          return;
        }
        waiting.delete(key);
        job.onSettled(result);
      });
  }

  return {
    run(key, task, onSettled) {
      const job = { task, onSettled } as Job;
      if (waiting.has(key)) {
        waiting.set(key, job);
        return;
      }
      waiting.set(key, null);
      start(key, job);
    },
    isPending: (key) => waiting.has(key),
  };
}
