export type GameSessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type GameSessionCodec<T> = {
  decode(value: unknown): T | null;
  encode(value: T): unknown;
};

export function readGameSession<T>(
  storage: Pick<GameSessionStorage, "getItem">,
  key: string,
  codec: GameSessionCodec<T>
): T | null {
  try {
    const raw = storage.getItem(key);
    return raw ? codec.decode(JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

export function writeGameSession<T>(
  storage: Pick<GameSessionStorage, "setItem">,
  key: string,
  value: T,
  codec: GameSessionCodec<T>
): void {
  try {
    const encoded = JSON.stringify(codec.encode(value));
    if (encoded !== undefined) storage.setItem(key, encoded);
  } catch {
    // Local play should continue when serialization or browser storage fails.
  }
}

export function removeGameSession(
  storage: Pick<GameSessionStorage, "removeItem">,
  key: string
): void {
  try {
    storage.removeItem(key);
  } catch {
    // Local play should continue when browser storage is unavailable.
  }
}
