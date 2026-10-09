import type { AppState } from "../../types/app.ts";

export type FeatureStateKey = "salesFeatureState" | "integrationFeatureState" | "gameSessionFeatureState";

type FeatureOwner = Record<string, unknown>;

/**
 * Keeps the long-standing root state API as accessors into a focused feature
 * owner. Vue's data proxy tracks the nested owner on each read and write, so
 * callers keep reactive compatibility without maintaining a second copy.
 */
export function attachFeatureStateAliases<T extends AppState>(
  root: T,
  ownerKey: FeatureStateKey,
  owner: object,
  keys: readonly string[]
): T {
  Object.defineProperty(root, ownerKey, {
    configurable: true,
    enumerable: true,
    value: owner
  });
  for (const key of keys) {
    Object.defineProperty(root, key, {
      configurable: true,
      enumerable: true,
      get(this: T & Record<FeatureStateKey, FeatureOwner>) {
        return (this[ownerKey] as unknown as FeatureOwner)[key];
      },
      set(this: T & Record<FeatureStateKey, FeatureOwner>, value: unknown) {
        (this[ownerKey] as unknown as FeatureOwner)[key] = value;
      }
    });
  }
  return root;
}

export type FeatureOwnerContext = Pick<AppState, "sales" | "salesByLotId"> & Partial<Record<FeatureStateKey, FeatureOwner>>;
