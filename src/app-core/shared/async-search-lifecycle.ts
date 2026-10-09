export type AsyncSearchState<T> = {
  phase: "idle" | "debouncing" | "loading" | "results" | "empty" | "error";
  results: T[];
  error: unknown | null;
};

/** Owns debounce and latest-request mechanics while callers retain domain-specific result rules. */
export class AsyncSearchLifecycle<T> {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private controller: AbortController | null = null;
  private revision = 0;
  private disposed = false;
  private state: AsyncSearchState<T> = { phase: "idle", results: [], error: null };

  constructor(private readonly onState?: (state: AsyncSearchState<T>) => void) {}

  snapshot(): AsyncSearchState<T> { return { ...this.state, results: [...this.state.results] }; }

  schedule(query: string, delayMs: number, run: (query: string, signal: AbortSignal) => Promise<T[]>): void {
    this.debounce(delayMs, () => { void this.execute(query, run); });
  }

  /** Debounce a domain action that will start its own request through execute(). */
  debounce(delayMs: number, run: () => void): void {
    if (this.disposed) return;
    this.cancelRequest();
    this.publish({ phase: "debouncing", results: [], error: null });
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.disposed) run();
    }, Math.max(0, delayMs));
  }

  async execute(query: string, run: (query: string, signal: AbortSignal) => Promise<T[]>): Promise<void> {
    if (this.disposed) return;
    this.cancelRequest();
    const revision = ++this.revision;
    const controller = new AbortController();
    this.controller = controller;
    this.publish({ phase: "loading", results: [], error: null });
    try {
      const results = await run(query, controller.signal);
      if (!this.isCurrent(revision, controller)) return;
      this.publish({ phase: results.length ? "results" : "empty", results, error: null });
    } catch (error) {
      if (!this.isCurrent(revision, controller) || controller.signal.aborted) return;
      this.publish({ phase: "error", results: [], error });
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  clear(): void {
    this.cancelRequest();
    this.publish({ phase: "idle", results: [], error: null });
  }

  dispose(): void {
    this.clear();
    this.disposed = true;
  }

  private cancelRequest(): void {
    this.revision += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.controller?.abort();
    this.controller = null;
  }

  private isCurrent(revision: number, controller: AbortController): boolean {
    return !this.disposed && this.revision === revision && this.controller === controller;
  }

  private publish(state: AsyncSearchState<T>): void {
    this.state = state;
    this.onState?.(this.snapshot());
  }
}
