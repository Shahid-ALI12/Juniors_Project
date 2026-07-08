/**
 * Verification Script: get_all_customer_balances RPC vs original TS logic
 *
 * PURPOSE:
 *   After deploying `supabase/add-customer-balance-rpc.sql` to Supabase SQL Editor,
 *   run this script to confirm the RPC output matches the original TS function
 *   EXACTLY. If any mismatch is found, do NOT deploy the TS code — revert the SQL.
 *
 * HOW TO RUN:
 *   cd /path/to/Juniors_Project
 *   npx tsx scripts/verify-customer-balance-rpc.ts
 *
 * OUTPUT:
 *   - Per-customer comparison table
 *   - PASS / FAIL summary at the end
 *   - If FAIL, lists which customers had mismatched numbers
 *
 * SAFETY:
 *   - Read-only — does NOT modify any data
 *   - Calls the RPC + raw queries, compares results in memory
 *   - Exits with code 0 on PASS, non-zero on FAIL
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Missing env vars. Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(2);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ─── Types ───
interface BalanceInfo {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  balance_due: number;
}

// ─── OLD logic (verbatim from reports.ts pre-RPC version) ───
async function oldGetAllCustomerBalances(): Promise<Record<number, BalanceInfo>> {
  const { data: sales, error } = await supabase
    .from("sales")
    .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received");
  if (error) throw error;

  const map: Record<number, BalanceInfo> = {};
  for (const s of sales || []) {
    const cid = s.customer_id as number;
    if (!map[cid]) map[cid] = { opening_balance: 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };
    map[cid].total_bill += (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
    map[cid].total_cash_paid += s.cash_received as number;
  }

  const { data: purchases } = await supabase
    .from("purchases")
    .select("settled_by_customer_id, quantity, rate_per_bag")
    .not("settled_by_customer_id", "is", null);
  for (const p of purchases || []) {
    const cid = p.settled_by_customer_id as number;
    if (!map[cid]) map[cid] = { opening_balance: 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };
    map[cid].total_goods_value += (p.quantity as number) * (p.rate_per_bag as number);
  }

  const { data: customerRows } = await supabase
    .from("customers")
    .select("id, opening_balance");
  const obMap: Record<number, number> = {};
  for (const c of customerRows || []) {
    obMap[c.id as number] = (c.opening_balance as number) ?? 0;
  }
  for (const c of customerRows || []) {
    const cid = c.id as number;
    if (!map[cid]) map[cid] = { opening_balance: 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };
    map[cid].opening_balance = obMap[cid] ?? 0;
  }
  for (const cid of Object.keys(map)) {
    const b = map[Number(cid)];
    b.balance_due = b.opening_balance + b.total_bill - b.total_cash_paid - b.total_goods_value;
  }
  return map;
}

// ─── NEW RPC call ───
async function newRpcGetAllCustomerBalances(): Promise<Record<number, BalanceInfo>> {
  const { data: rpcRows, error } = await supabase.rpc("get_all_customer_balances");
  if (error) throw error;
  if (!Array.isArray(rpcRows)) throw new Error("RPC did not return an array");

  const map: Record<number, BalanceInfo> = {};
  for (const row of rpcRows as any[]) {
    const cid = Number(row.customer_id);
    map[cid] = {
      opening_balance: Number(row.opening_balance ?? 0),
      total_bill: Number(row.total_bill ?? 0),
      total_cash_paid: Number(row.total_cash_paid ?? 0),
      total_goods_value: Number(row.total_goods_value ?? 0),
      balance_due: Number(row.balance_due ?? 0),
    };
  }
  return map;
}

// ─── Compare two balances with tolerance for floating-point ───
const TOLERANCE = 0.01; // 1 paisa
function balancesEqual(a: BalanceInfo, b: BalanceInfo): boolean {
  return (
    Math.abs(a.opening_balance - b.opening_balance) < TOLERANCE &&
    Math.abs(a.total_bill - b.total_bill) < TOLERANCE &&
    Math.abs(a.total_cash_paid - b.total_cash_paid) < TOLERANCE &&
    Math.abs(a.total_goods_value - b.total_goods_value) < TOLERANCE &&
    Math.abs(a.balance_due - b.balance_due) < TOLERANCE
  );
}

// ─── Main ───
async function main() {
  console.log("🔍 Verifying get_all_customer_balances RPC vs TS logic...\n");

  // Check if RPC exists
  try {
    const { error } = await supabase.rpc("get_all_customer_balances").limit(1);
    if (error) {
      console.error("❌ RPC not deployed yet. Run supabase/add-customer-balance-rpc.sql in Supabase SQL Editor first.\n");
      console.error("   Error:", error.message);
      process.exit(3);
    }
  } catch (e: any) {
    console.error("❌ RPC call failed:", e.message);
    process.exit(3);
  }

  console.log("✅ RPC is deployed. Running comparison...\n");

  const [oldMap, newMap] = await Promise.all([
    oldGetAllCustomerBalances(),
    newRpcGetAllCustomerBalances(),
  ]);

  const oldIds = new Set(Object.keys(oldMap).map(Number));
  const newIds = new Set(Object.keys(newMap).map(Number));

  const allIds = new Set([...oldIds, ...newIds]);
  const sortedIds = Array.from(allIds).sort((a, b) => a - b);

  let matchCount = 0;
  let mismatchCount = 0;
  const mismatches: Array<{ cid: number; field: string; old: number; new: number }> = [];

  console.log("ID    | OB         | TB         | TCP        | TGV        | BD         | STATUS");
  console.log("------|------------|------------|------------|------------|------------|--------");

  for (const cid of sortedIds) {
    const old = oldMap[cid] ?? { opening_balance: 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };
    const neu = newMap[cid] ?? { opening_balance: 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };

    const status = balancesEqual(old, neu) ? "✓" : "✗ MISMATCH";

    console.log(
      `${String(cid).padStart(5)} | ${old.opening_balance.toFixed(2).padStart(10)} | ${old.total_bill.toFixed(2).padStart(10)} | ${old.total_cash_paid.toFixed(2).padStart(10)} | ${old.total_goods_value.toFixed(2).padStart(10)} | ${old.balance_due.toFixed(2).padStart(10)} | ${status}`
    );

    if (balancesEqual(old, neu)) {
      matchCount++;
    } else {
      mismatchCount++;
      if (Math.abs(old.opening_balance - neu.opening_balance) >= TOLERANCE)
        mismatches.push({ cid, field: "opening_balance", old: old.opening_balance, new: neu.opening_balance });
      if (Math.abs(old.total_bill - neu.total_bill) >= TOLERANCE)
        mismatches.push({ cid, field: "total_bill", old: old.total_bill, new: neu.total_bill });
      if (Math.abs(old.total_cash_paid - neu.total_cash_paid) >= TOLERANCE)
        mismatches.push({ cid, field: "total_cash_paid", old: old.total_cash_paid, new: neu.total_cash_paid });
      if (Math.abs(old.total_goods_value - neu.total_goods_value) >= TOLERANCE)
        mismatches.push({ cid, field: "total_goods_value", old: old.total_goods_value, new: neu.total_goods_value });
      if (Math.abs(old.balance_due - neu.balance_due) >= TOLERANCE)
        mismatches.push({ cid, field: "balance_due", old: old.balance_due, new: neu.balance_due });
    }
  }

  // Check for ID set differences
  const onlyInOld = [...oldIds].filter((id) => !newIds.has(id));
  const onlyInNew = [...newIds].filter((id) => !oldIds.has(id));

  console.log("\n─────────────────────────────────────────────────────────");
  console.log(`Total customers compared: ${sortedIds.length}`);
  console.log(`  ✓ Matches:    ${matchCount}`);
  console.log(`  ✗ Mismatches: ${mismatchCount}`);
  console.log(`  Only in OLD (TS): ${onlyInOld.length} → ${onlyInOld.slice(0, 10).join(", ")}${onlyInOld.length > 10 ? "..." : ""}`);
  console.log(`  Only in NEW (RPC): ${onlyInNew.length} → ${onlyInNew.slice(0, 10).join(", ")}${onlyInNew.length > 10 ? "..." : ""}`);

  if (mismatches.length > 0) {
    console.log("\n❌ FIELD-LEVEL MISMATCHES:");
    for (const m of mismatches.slice(0, 30)) {
      console.log(`  Customer #${m.cid} — ${m.field}: OLD=${m.old.toFixed(2)} vs NEW=${m.new.toFixed(2)} (diff=${(m.new - m.old).toFixed(2)})`);
    }
    if (mismatches.length > 30) console.log(`  ... and ${mismatches.length - 30} more`);
  }

  console.log("\n─────────────────────────────────────────────────────────");
  if (mismatchCount === 0 && onlyInOld.length === 0 && onlyInNew.length === 0) {
    console.log("✅ PASS — RPC output matches TS logic EXACTLY for all customers.");
    console.log("   Safe to deploy the TS code. Fallback path will be dead code (kept for safety).");
    process.exit(0);
  } else {
    console.log("❌ FAIL — RPC output does NOT match TS logic.");
    console.log("   Do NOT deploy the TS code yet. Investigate mismatches above.");
    console.log("   To rollback: DROP FUNCTION public.get_all_customer_balances();");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Script crashed:", err);
  process.exit(99);
});
