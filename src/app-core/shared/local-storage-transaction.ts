export interface LocalStorageWrite {
  key: string;
  value: string;
}

/**
 * Applies a group of local-storage writes with rollback on failure. Browser
 * storage has no native transaction, so restoring every prior value is the
 * strongest synchronous guarantee available to the local-first sync path.
 */
export function commitLocalStorageWrites(writes: LocalStorageWrite[]): void {
  const previous = new Map<string, string | null>();
  try {
    for (const write of writes) {
      if (!previous.has(write.key)) previous.set(write.key, localStorage.getItem(write.key));
      localStorage.setItem(write.key, write.value);
    }
  } catch (error) {
    for (const [key, value] of [...previous.entries()].reverse()) {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    }
    throw error;
  }
}
