import { describe, it, expect } from "vitest";
import { createLatestWinsQueue } from "./latestWinsQueue";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createLatestWinsQueue", () => {
  it("runs one request per key and only the latest of those queued behind it", async () => {
    const q = createLatestWinsQueue();
    const sent: string[] = [];
    const first = deferred<string>();
    const settled: (string | null)[] = [];
    q.run("a", () => { sent.push("1"); return first.promise; }, (r) => settled.push(r));
    q.run("a", () => { sent.push("2"); return Promise.resolve("2"); }, (r) => settled.push(r));
    q.run("a", () => { sent.push("3"); return Promise.resolve("3"); }, (r) => settled.push(r));
    expect(sent).toEqual(["1"]);
    expect(q.isPending("a")).toBe(true);
    first.resolve("1");
    await flush();
    expect(sent).toEqual(["1", "3"]);
    expect(settled).toEqual(["3"]);
    expect(q.isPending("a")).toBe(false);
  });

  it("keeps keys independent", async () => {
    const q = createLatestWinsQueue();
    const sent: string[] = [];
    const a = deferred<void>();
    q.run("a", () => { sent.push("a"); return a.promise; }, () => {});
    q.run("b", () => { sent.push("b"); return Promise.resolve(); }, () => {});
    expect(sent).toEqual(["a", "b"]);
    await flush();
    expect(q.isPending("b")).toBe(false);
    expect(q.isPending("a")).toBe(true);
  });

  it("settles with null when the last request throws, and moves on after a failure", async () => {
    const q = createLatestWinsQueue();
    const settled: unknown[] = [];
    const first = deferred<string>();
    q.run("a", () => first.promise, (r) => settled.push(r));
    q.run("a", () => Promise.reject(new Error("offline")), (r) => settled.push(r));
    first.reject(new Error("offline"));
    await flush();
    expect(settled).toEqual([null]);
    expect(q.isPending("a")).toBe(false);
  });
});
