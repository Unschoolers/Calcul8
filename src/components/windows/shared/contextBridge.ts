import { getCurrentInstance, inject, type PropType } from "vue";

export type WindowContext = Record<string, unknown>;
export type GameContextProps = { ctx: WindowContext };
type MaybeWindowContext = WindowContext | null | undefined;
type BridgeOptions = {
  blockedKeys?: Array<string | symbol>;
};

const WINDOW_BRIDGE_SOURCE = Symbol("windowBridgeSource");

function isReservedVueKey(key: string | symbol): boolean {
  return typeof key === "string" && (key.startsWith("$") || key.startsWith("_"));
}

function getInternalCtx(ctx: MaybeWindowContext): WindowContext | undefined {
  if (!ctx || typeof ctx !== "object") return undefined;
  return (ctx as { $?: { ctx?: Record<string, unknown> } }).$?.ctx as WindowContext | undefined;
}

function looksLikeAppContext(ctx: MaybeWindowContext): ctx is WindowContext {
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
  const candidates: MaybeWindowContext[] = [
    ctx,
    (ctx as { $root?: unknown }).$root as MaybeWindowContext,
    getInternalCtx(ctx),
    getCurrentInstance()?.proxy?.$root as unknown as MaybeWindowContext
  ];

  for (const candidate of candidates) {
    if (looksLikeAppContext(candidate)) {
      return candidate;
    }
  }

  return ctx;
}

export function createWindowContextBridge(ctx: WindowContext, options: BridgeOptions = {}): Record<string, unknown> {
  const sourceCtx = resolveWindowContext(ctx);
  return createBridgeFromSource(sourceCtx, options);
}

export function createNestedWindowContextBridge(ctx: WindowContext, options: BridgeOptions = {}): Record<string, unknown> {
  return createBridgeFromSource(ctx, options);
}

/**
 * Gives nested game components one consistent source of truth. Game-local
 * context wins, followed by the explicit prop and finally the application
 * context used by standalone component mounts.
 */
export function useGameNestedWindowContextBridge(props: { ctx: WindowContext }): Record<string, unknown> {
  const gameContext = inject<WindowContext | null>("gameCtx", null);
  const appContext = inject<WindowContext | null>("appCtx", null);
  return createNestedWindowContextBridge(gameContext ?? props.ctx ?? appContext ?? {});
}

/** Shared Vue contract for every child hosted by the game window. */
export const gameContextProp = {
  type: Object as PropType<WindowContext>,
  required: true
} as const;

export function setupGameContext(props: GameContextProps): Record<string, unknown> {
  return useGameNestedWindowContextBridge(props);
}

export function getGameContextSource(context: WindowContext): WindowContext {
  const explicitContext = context.ctx;
  return explicitContext && typeof explicitContext === "object"
    ? explicitContext as WindowContext
    : context;
}

export function unwrapWindowBridgeContext(ctx: WindowContext): WindowContext {
  const bridgedSource = Reflect.get(ctx, WINDOW_BRIDGE_SOURCE) as WindowContext | undefined;
  if (bridgedSource && typeof bridgedSource === "object") {
    return bridgedSource;
  }
  return ctx;
}

function createBridgeFromSource(sourceCtx: WindowContext, options: BridgeOptions = {}): Record<string, unknown> {
  const internalCtx = getInternalCtx(sourceCtx);
  const owningInstance = getCurrentInstance() as { data?: Record<string, unknown>; ctx?: Record<string, unknown> } | null;
  const blockedKeys = new Set(options.blockedKeys || []);

  const isBlockedKey = (key: string | symbol): boolean => blockedKeys.has(key);

  const readValue = (key: string | symbol): unknown => {
    if (isBlockedKey(key)) {
      return undefined;
    }
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
    if (isBlockedKey(key)) {
      return false;
    }
    if (Reflect.has(sourceCtx, key)) {
      return true;
    }
    if (internalCtx && Reflect.has(internalCtx, key)) {
      return true;
    }
    return false;
  };

  return new Proxy(
    {},
    {
      has(_target, key: string | symbol) {
        return hasKey(key);
      },
      getOwnPropertyDescriptor(_target, key: string | symbol) {
        if (!hasKey(key) || isReservedVueKey(key)) {
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
        if (key === WINDOW_BRIDGE_SOURCE) {
          return sourceCtx;
        }
        const value = readValue(key);
        if (typeof value === "function") {
          return value.bind(sourceCtx);
        }
        return value;
      },
      set(_target, key: string | symbol, value: unknown) {
        if (isBlockedKey(key)) {
          if (owningInstance?.data && Reflect.has(owningInstance.data, key)) {
            Reflect.set(owningInstance.data, key, value, owningInstance.data);
          } else if (owningInstance?.ctx && Reflect.has(owningInstance.ctx, key)) {
            Reflect.set(owningInstance.ctx, key, value, owningInstance.ctx);
          }
          return true;
        }
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
