// Tiny in-memory TTL cache shared by the route handlers. Keeps upstream
// request volume polite (CelesTrak asks for <= 1 fetch per group per 2h,
// OpenSky bills anonymous users 400 credits/day) and makes repeated browser
// polling cheap. Lives for the life of the server process only.

interface Entry<T> {
  value: T;
  expires: number;
  storedAt: number;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export interface Cached<T> {
  value: T;
  /** Age of the cached value in ms (0 when freshly fetched). */
  age: number;
  hit: boolean;
}

/**
 * Get a value from the cache or produce it. Concurrent callers for the same
 * key share one producer call. On upstream failure a stale value is served
 * if one exists.
 */
export async function cached<T>(
  key: string,
  ttlMs: number,
  produce: () => Promise<T>,
): Promise<Cached<T>> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expires > now) {
    return { value: hit.value, age: now - hit.storedAt, hit: true };
  }
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = produce().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  try {
    const value = await p;
    store.set(key, { value, expires: Date.now() + ttlMs, storedAt: Date.now() });
    return { value, age: 0, hit: false };
  } catch (err) {
    if (hit) return { value: hit.value, age: now - hit.storedAt, hit: true };
    throw err;
  }
}

export function cacheStats() {
  return { entries: store.size, inflight: inflight.size };
}
