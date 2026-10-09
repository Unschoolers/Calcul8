export type GameExecution = "preview" | "live";

export interface GameSessionEngineAdapter<TState> {
  reset(state: TState, execution: GameExecution): TState;
  shouldPublish(execution: GameExecution): boolean;
}

export interface GameSessionEnginePorts<TState> {
  persist(state: TState): void | Promise<void>;
  publish(state: TState): void | Promise<void>;
}

export interface GameSessionLifecycleAdapter<TState, TEvent> {
  transition(state: TState, event: TEvent): TState;
  shouldPublish(event: TEvent): boolean;
}

export async function runGameSessionLifecycle<TState, TEvent>(
  state: TState,
  event: TEvent,
  adapter: GameSessionLifecycleAdapter<TState, TEvent>,
  ports: GameSessionEnginePorts<TState>
): Promise<TState> {
  const next = adapter.transition(state, event);
  await ports.persist(next);
  if (adapter.shouldPublish(event)) await ports.publish(next);
  return next;
}

/** Runs one session reset and owns its ordered persistence/publication effects. */
export async function runGameSessionReset<TState>(
  state: TState,
  execution: GameExecution,
  adapter: GameSessionEngineAdapter<TState>,
  ports: GameSessionEnginePorts<TState>
): Promise<TState> {
  return runGameSessionLifecycle(state, execution, {
    transition: adapter.reset,
    shouldPublish: adapter.shouldPublish
  }, ports);
}
