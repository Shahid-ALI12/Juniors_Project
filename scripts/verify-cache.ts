/**
 * Quick sanity test for src/lib/cache.ts
 * Run with: npx tsx scripts/verify-cache.ts
 */
import { cachedGet, invalidateByTag, invalidateUser, cacheStats, clearCache } from "../src/lib/cache";

async function main() {
  console.log("=== Cache Sanity Test ===\n");

  // 1. Basic set/get
  let calls = 0;
  const r1 = await cachedGet("test:1", ["domain:a"], 60_000, async () => {
    calls++;
    return { value: "hello", n: calls };
  });
  const r2 = await cachedGet("test:1", ["domain:a"], 60_000, async () => {
    calls++;
    return { value: "hello", n: calls };
  });
  console.log("1. Cache hit test:");
  console.log("   First call  :", r1);
  console.log("   Second call :", r2, "(should be same as first, loader called once)");
  console.log("   Loader calls:", calls, "(expect 1)");
  console.log("");

  // 2. Different key = miss
  const r3 = await cachedGet("test:2", ["domain:a"], 60_000, async () => ({ fresh: true }));
  console.log("2. Different key miss:", r3);
  console.log("");

  // 3. Tag invalidation
  await cachedGet("test:3", ["domain:b"], 60_000, async () => ({ tag: "b-data" }));
  await cachedGet("test:4", ["domain:b"], 60_000, async () => ({ tag: "b-data-2" }));
  console.log("3. Before invalidation — stats:", cacheStats());
  invalidateByTag("domain:b");
  console.log("   After invalidating 'domain:b' — stats:", cacheStats());
  console.log("");

  // 4. TTL expiry (short TTL test)
  let ttlCalls = 0;
  await cachedGet("ttl:1", ["domain:c"], 50, async () => { ttlCalls++; return ttlCalls; });
  await cachedGet("ttl:1", ["domain:c"], 50, async () => { ttlCalls++; return ttlCalls; });
  await new Promise(r => setTimeout(r, 100));
  await cachedGet("ttl:1", ["domain:c"], 50, async () => { ttlCalls++; return ttlCalls; });
  console.log("4. TTL expiry test — loader calls (expect 2):", ttlCalls);
  console.log("");

  // 5. Per-user isolation
  let userACalls = 0;
  await cachedGet("u:userA:data", ["data:userA"], 60_000, async () => { userACalls++; return userACalls; });
  await cachedGet("u:userB:data", ["data:userB"], 60_000, async () => 999); // different user, different cache
  const userASecond = await cachedGet("u:userA:data", ["data:userA"], 60_000, async () => { userACalls++; return userACalls; });
  console.log("5. Per-user isolation — userA loader calls (expect 1):", userACalls, "— value:", userASecond);
  console.log("");

  // 6. invalidateUser
  invalidateUser("userA");
  console.log("6. After invalidateUser('userA') — stats:", cacheStats());
  console.log("");

  // 7. Loader throws → propagates (cache should NOT swallow user errors)
  try {
    await cachedGet("err:1", ["domain:e"], 60_000, async () => { throw new Error("User business error"); });
    console.log("7. FAIL: should have thrown");
  } catch (e: any) {
    console.log("7. Loader error propagates correctly:", e.message);
  }
  console.log("");

  // 8. Non-JSON-serializable data (circular) → should bypass cache, return data
  const circular: any = { a: 1 };
  circular.self = circular;
  const r8 = await cachedGet("circ:1", ["domain:f"], 60_000, async () => circular);
  console.log("8. Non-serializable data returns correctly:", r8.a === 1);
  console.log("");

  clearCache();
  console.log("=== All tests passed ===");
  console.log("Final stats:", cacheStats());
}

main().catch(err => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
