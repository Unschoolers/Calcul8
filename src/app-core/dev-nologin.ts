export function isDevNoLoginRoute(): boolean {
  if (!import.meta.env.DEV) return false;
  const locationLike = (globalThis as { window?: { location?: Location }; location?: Location }).window?.location
    ?? (globalThis as { location?: Location }).location;
  return locationLike?.pathname === "/nologin";
}
