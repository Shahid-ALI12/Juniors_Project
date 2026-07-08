/**
 * Lightweight in-memory cache for server-side hot reads.
 *
 * Design goals:
 *  - Zero side-effects on existing business logic (try/catch fallback everywhere)
 *  - Per-user isolation (cache key always includes userId → no cross-user leak)
 *  - Tag-based invalidation (mutate → invalidate by domain tag)
 *  - TTL-based expiry (short — 5–30s for financial data, longer for slow-changing)
 *  - Bounded memory (LRU eviction when MAX_ENTRIES exceeded)
 *  - No external dependencies (no lru-cache, no Redis)
 *
 * Usage:
 *   GET route:
 *     const data = await cachedGet(userId, "cash-balances", ["cash"], 5_000, () => getCashBalances());
 *
 *   Mutation route (after successful write):
 *     invalidateByTag(`cash:${userId}`);   // invalidate only this user's cash entries
 *
 * Tag convention: `<domain>:<userId>` — per-user isolation built into the tag.
 * Mutations that affect ALL users (none currently, but reserved): use `<domain>:*`.
 */

type CacheEntry = {
  data: unknown;
  expiresAt: number; // epoch ms
  tags: string[];
  lastAccess: number; // for LRU eviction
};

const MAX_ENTRIES = 500; // hard cap to avoid memory bloat
const CLEANUP_INTERVAL = 50; // run eviction every N writes
let writeCounter = 0;

const store = new Map<string, CacheEntry>();
const tagIndex = new Map<string, Set<string>>(); // tag → set of keys

/**
 * Get from cache or call loader. Always returns fresh data on miss.
 * Never throws — if anything goes wrong internally, just calls loader.
 */
export async function cachedGet<T>(
  key: string,
  tags: string[],
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  try {
    const now = Date.now();
    const hit = store.get(key);
    if (hit && hit.expiresAt > now) {
      hit.lastAccess = now;
      return hit.data as T;
    }
    // Miss — load fresh
    const data = await loader();
    // Only cache successful, JSON-serializable data
    try {
      JSON.stringify(data); // throws on circular refs / functions
      put(key, data, tags, ttlMs, now);
    } catch {
      // Non-cacheable shape — skip caching silently
    }
    return data;
  } catch {
    // Total failure — bypass cache
    return loader();
  }
}

function put(key: string, data: unknown, tags: string[], ttlMs: number, now: number): void {
  // Evict expired + LRU overflow if we're at capacity
  writeCounter++;
  if (writeCounter >= CLEANUP_INTERVAL) {
    writeCounter = 0;
    evictExpired(now);
    if (store.size >= MAX_ENTRIES) evictLRU(MAX_ENTRIES - 1);
  }

  // Remove existing entry's tag associations (in case of overwrite)
  removeKeyFromTags(key);

  store.set(key, {
    data,
    expiresAt: now + ttlMs,
    tags: tags.slice(),
    lastAccess: now,
  });

  for (const t of tags) {
    let set = tagIndex.get(t);
    if (!set) {
      set = new Set();
      tagIndex.set(t, set);
    }
    set.add(key);
  }
}

function removeKeyFromTags(key: string): void {
  const entry = store.get(key);
  if (!entry) return;
  for (const t of entry.tags) {
    const set = tagIndex.get(t);
    if (set) {
      set.delete(key);
      if (set.size === 0) tagIndex.delete(t);
    }
  }
}

function evictExpired(now: number): void {
  const keys = Array.from(store.keys());
  for (const k of keys) {
    const e = store.get(k);
    if (e && e.expiresAt <= now) {
      removeKeyFromTags(k);
      store.delete(k);
    }
  }
}

function evictLRU(targetSize: number): void {
  // Sort by lastAccess ascending, evict oldest until under target
  const entries = Array.from(store.entries()).sort((a, b) => a[1].lastAccess - b[1].lastAccess);
  for (let i = 0; i < entries.length && store.size > targetSize; i++) {
    const [k] = entries[i];
    removeKeyFromTags(k);
    store.delete(k);
  }
}


/**
 * Invalidate all cache entries that match ANY of the given tags.
 * Safe to call with non-existent tags — no-op.
 */
export function invalidateByTag(...tags: string[]): void {
  try {
    const keysToDelete = new Set<string>();
    for (const t of tags) {
      const keys = tagIndex.get(t);
      if (!keys) continue;
      const keysArr = Array.from(keys);
      for (const k of keysArr) keysToDelete.add(k);
      tagIndex.delete(t);
    }
    const keysToDeleteArr = Array.from(keysToDelete);
    for (const k of keysToDeleteArr) {
      const entry = store.get(k);
      if (entry) {
        // Remove other tag associations for cleanliness
        for (const t of entry.tags) {
          if (!tags.includes(t)) {
            const s = tagIndex.get(t);
            if (s) {
              s.delete(k);
              if (s.size === 0) tagIndex.delete(t);
            }
          }
        }
      }
      store.delete(k);
    }
  } catch {
    // Invalidation failure is non-fatal — worst case: stale data until TTL expiry
  }
}

/**
 * Invalidate ALL entries for a specific user.
 * Useful on logout or admin forced refresh.
 */
export function invalidateUser(userId: string): void {
  try {
    const prefix = `u:${userId}:`;
    const allKeys = Array.from(store.keys());
    const keys: string[] = [];
    for (const k of allKeys) {
      if (k.startsWith(prefix)) keys.push(k);
    }
    for (const k of keys) {
      removeKeyFromTags(k);
      store.delete(k);
    }
  } catch {
    // Non-fatal
  }
}

/**
 * Clear the entire cache (for tests / admin debug only).
 */
export function clearCache(): void {
  store.clear();
  tagIndex.clear();
}

/**
 * Internal stats — exposed for optional debug logging.
 * Returns 0s on any error (never throws).
 */
export function cacheStats(): { entries: number; tags: number } {
  try {
    return { entries: store.size, tags: tagIndex.size };
  } catch {
    return { entries: 0, tags: 0 };
  }
}

// ─── Convenience: build per-user keys + tags ───

/**
 * Build a cache key scoped to a specific user.
 * Example: userKey("admin-123", "cash-balances") → "u:admin-123:cash-balances"
 */
export function userKey(userId: string, name: string, suffix = ""): string {
  return `u:${userId}:${name}${suffix ? ":" + suffix : ""}`;
}

/**
 * Build a per-user domain tag.
 * Example: userTag("admin-123", "cash") → "cash:admin-123"
 */
export function userTag(userId: string, domain: string): string {
  return `${domain}:${userId}`;
}
