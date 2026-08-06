type BoundFunction = {
  source: (...args: never[]) => unknown;
  value: (...args: never[]) => unknown;
};

export type CapabilityPortOptions<TSource extends object> = {
  requiredFunctions?: readonly (keyof TSource)[];
};

/**
 * Builds a small live view over an application context. Only declared keys are
 * exposed, commands retain their owning `this`, and writes flow back to the
 * reactive source for controls using v-model.
 */
export function createCapabilityPorts<
  TSource extends object,
  const TKeys extends readonly (keyof TSource)[]
>(
  source: TSource,
  keys: TKeys,
  options: CapabilityPortOptions<TSource> = {}
): Pick<TSource, TKeys[number]> {
  for (const key of options.requiredFunctions ?? []) {
    if (typeof Reflect.get(source, key) !== "function") {
      throw new TypeError(`Capability port "${String(key)}" must be a function.`);
    }
  }

  const ports = {} as Pick<TSource, TKeys[number]>;
  const boundFunctions = new Map<keyof TSource, BoundFunction>();

  for (const key of keys) {
    Object.defineProperty(ports, key, {
      enumerable: true,
      configurable: false,
      get() {
        const value = Reflect.get(source, key);
        if (typeof value !== "function") return value;
        const callable = value as (...args: never[]) => unknown;

        const cached = boundFunctions.get(key);
        if (cached?.source === callable) return cached.value;

        const bound = callable.bind(source) as (...args: never[]) => unknown;
        boundFunctions.set(key, { source: callable, value: bound });
        return bound;
      },
      set(value: unknown) {
        Reflect.set(source, key, value);
      }
    });
  }

  return ports;
}
