export function resolveRealtimeSmokeConfig(args?: {
  env?: Record<string, string | undefined>;
  argv?: string[];
}): Record<string, unknown>;

export function runRealtimeSmoke(
  config: Record<string, unknown>,
  deps?: Record<string, unknown>
): Promise<Record<string, unknown>>;

export function signRealtimeSmokeSubscribeToken(
  payload: Record<string, unknown>,
  secret: string
): string;
