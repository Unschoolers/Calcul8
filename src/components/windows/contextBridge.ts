import { getCurrentInstance } from "vue";

type WindowContext = Record<string, unknown>;

function looksLikeAppContext(ctx: WindowContext | null | undefined): ctx is WindowContext {
  if (!ctx || typeof ctx !== "object") return false;
  return (
    Reflect.has(ctx, "currentTab") &&
    Reflect.has(ctx, "boxesPurchased") &&
    Reflect.has(ctx, "sellingCurrency") &&
    Reflect.has(ctx, "lots") &&
    Reflect.has(ctx, "sales") &&
    Reflect.has(ctx, "formatCurrency") &&
    Reflect.has(ctx, "onPurchaseConfigChange")
  );
}

export function resolveWindowContext(ctx: WindowContext): WindowContext {
  if (looksLikeAppContext(ctx)) {
    return ctx;
  }

  const rootFromCtx = (ctx as { $root?: unknown }).$root as WindowContext | undefined;
  if (looksLikeAppContext(rootFromCtx)) {
    return rootFromCtx;
  }

  const internalCtx = (ctx as { $?: { ctx?: Record<string, unknown> } }).$?.ctx as
    | WindowContext
    | undefined;
  if (looksLikeAppContext(internalCtx)) {
    return internalCtx;
  }

  const fallbackRoot = getCurrentInstance()?.proxy?.$root as unknown as WindowContext | undefined;
  if (looksLikeAppContext(fallbackRoot)) {
    return fallbackRoot;
  }

  return ctx;
}

export function createWindowContextBridge(ctx: WindowContext): Record<string, unknown> {
  const sourceCtx = resolveWindowContext(ctx);

  const internalCtx = (sourceCtx as { $?: { ctx?: Record<string, unknown> } }).$?.ctx;

  const readValue = (key: string | symbol): unknown => {
    const directValue = Reflect.get(sourceCtx, key, sourceCtx);
    if (directValue !== undefined) {
      return directValue;
    }
    if (!internalCtx) {
      return undefined;
    }
    return Reflect.get(internalCtx, key, internalCtx);
  };

  const hasKey = (key: string | symbol): boolean => {
    if (Reflect.has(sourceCtx, key)) {
      return true;
    }
    if (internalCtx && Reflect.has(internalCtx, key)) {
      return true;
    }
    return false;
  };

  const listKeys = (): Array<string | symbol> => {
    const keys = new Set<string | symbol>(Reflect.ownKeys(sourceCtx));
    if (internalCtx) {
      for (const key of Reflect.ownKeys(internalCtx)) {
        keys.add(key);
      }
    }
    return [...keys];
  };

  return new Proxy(
    {},
    {
      has(_target, key: string | symbol) {
        return hasKey(key);
      },
      ownKeys() {
        return listKeys();
      },
      getOwnPropertyDescriptor(_target, key: string | symbol) {
        if (!hasKey(key)) {
          return undefined;
        }
        return {
          enumerable: true,
          configurable: true,
          writable: true,
          value: readValue(key)
        };
      },
      get(_target, key: string | symbol) {
        const value = readValue(key);
        if (typeof value === "function") {
          return value.bind(sourceCtx);
        }
        return value;
      },
      set(_target, key: string | symbol, value: unknown) {
        if (internalCtx && Reflect.has(internalCtx, key) && !Reflect.has(sourceCtx, key)) {
          Reflect.set(internalCtx, key, value, internalCtx);
          return true;
        }
        Reflect.set(sourceCtx, key, value, sourceCtx);
        return true;
      }
    }
  );
}
