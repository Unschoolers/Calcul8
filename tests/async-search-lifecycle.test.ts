import { describe, expect, it, vi } from "vitest";
import { AsyncSearchLifecycle } from "../src/app-core/shared/async-search-lifecycle.ts";

describe("AsyncSearchLifecycle", () => {
  it("debounces letter-by-letter input to the latest query", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async (query: string) => [query]);
    const lifecycle = new AsyncSearchLifecycle<string>();
    lifecycle.schedule("c", 200, run);
    lifecycle.schedule("ca", 200, run);
    lifecycle.schedule("cat", 200, run);
    await vi.advanceTimersByTimeAsync(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("cat", expect.any(AbortSignal));
    expect(lifecycle.snapshot()).toMatchObject({ phase: "results", results: ["cat"] });
    vi.useRealTimers();
  });

  it("ignores stale completion and aborts it when replaced", async () => {
    let resolveOld!: (value: string[]) => void;
    let oldSignal!: AbortSignal;
    const states: string[] = [];
    const lifecycle = new AsyncSearchLifecycle<string>((state) => states.push(state.phase));
    const old = lifecycle.execute("old", (_query, signal) => {
      oldSignal = signal;
      return new Promise<string[]>((resolve) => { resolveOld = resolve; });
    });
    const newer = lifecycle.execute("new", async () => ["new"]);
    expect(oldSignal.aborted).toBe(true);
    resolveOld(["old"]);
    await Promise.all([old, newer]);
    expect(lifecycle.snapshot().results).toEqual(["new"]);
    expect(states.filter((phase) => phase === "results")).toHaveLength(1);
  });

  it("clears, disposes, and distinguishes empty results from failures", async () => {
    const lifecycle = new AsyncSearchLifecycle<string>();
    await lifecycle.execute("none", async () => []);
    expect(lifecycle.snapshot().phase).toBe("empty");
    await lifecycle.execute("bad", async () => { throw new Error("offline"); });
    expect(lifecycle.snapshot()).toMatchObject({ phase: "error", error: new Error("offline") });
    lifecycle.clear();
    expect(lifecycle.snapshot()).toMatchObject({ phase: "idle", results: [], error: null });
    lifecycle.dispose();
    await lifecycle.execute("ignored", async () => ["ignored"]);
    expect(lifecycle.snapshot().phase).toBe("idle");
  });

  it("does not publish state or schedule work after disposal", async () => {
    vi.useFakeTimers();
    const onState = vi.fn();
    const run = vi.fn();
    const lifecycle = new AsyncSearchLifecycle<string>(onState);
    lifecycle.dispose();
    const disposedState = lifecycle.snapshot();
    const publishedCount = onState.mock.calls.length;

    lifecycle.debounce(100, run);
    lifecycle.schedule("ignored", 100, async () => ["ignored"]);
    await lifecycle.execute("ignored", async () => ["ignored"]);
    await vi.advanceTimersByTimeAsync(100);

    expect(lifecycle.snapshot()).toEqual(disposedState);
    expect(onState).toHaveBeenCalledTimes(publishedCount);
    expect(run).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
