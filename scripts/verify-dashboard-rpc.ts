/**
 * Verification Script: get_dashboard_metrics RPC vs original TS logic
 *
 * Run AFTER deploying `supabase/add-dashboard-reconciliation-rpc.sql` to Supabase.
 *
 * HOW TO RUN:
 *   npx tsx scripts/verify-dashboard-rpc.ts
 *
 * OUTPUT:
 *   - Comparison of all 7 metrics
 *   - PASS / FAIL summary
 *   - Exits 0 on PASS, non-zero on FAIL
 *
 * SAFETY: Read-only — does NOT modify any data.
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

const CREDIT_LIMIT = 3_000_000;
const TOLERANCE = 0.01;

interface DashboardMetrics {
  salesTodayCount: number;
  billedToday: number;
  cashCollectedToday: number;
  expensesToday: number;
  totalCustomers: number;
  totalOutstanding: number;
  overCreditLimitCount: number;
}

// ─── OLD TS logic (verbatim from reports.ts pre-RPC) ───
async function oldGetDashboardMetrics(today: string): Promise<DashboardMetrics> {
  const [salesRes, expRes, custRes, allSalesRes] = await Promise.all([
    supabase.from("sales")
      .select("quantity, rate_per_bag, rickshaw_fare, cash_received, customer_id")
      .eq("sale_date", today),
    supabase.from("expenses")
      .select("amount")
      .eq("expense_date", today),
    supabase.from("customers")
      .select("*", { count: "exact", head: true }),
    supabase.from("sales")
      .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received"),
  ]);

  if (salesRes.error) throw salesRes.error;
  if (expRes.error) throw expRes.error;
  if (custRes.error) throw custRes.error;
  if (allSalesRes.error) throw allSalesRes.error;

  const todaySales = salesRes.data || [];
  const todayExp = expRes.data || [];
  const custCount = custRes.count ?? 0;
  const allSales = allSalesRes.data || [];

  const balances: Record<number, number> = {};
  for (const s of allSales) {
    const bill = (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
    const cid = s.customer_id as number;
    balances[cid] = (balances[cid] || 0) + bill - (s.cash_received as number);
  }

  return {
    salesTodayCount: todaySales.length,
    billedToday: todaySales.reduce((s, x) => s + (x.quantity as number) * (x.rate_per_bag as number) + (x.rickshaw_fare as number), 0),
    cashCollectedToday: todaySales.reduce((s, x) => s + (x.cash_received as number), 0),
    expensesToday: todayExp.reduce((s, x) => s + (x.amount as number), 0),
    totalCustomers: custCount,
    totalOutstanding: Object.values(balances).reduce((a, b) => a + b, 0),
    overCreditLimitCount: Object.values(balances).filter((b) => b > CREDIT_LIMIT).length,
  };
}

// ─── NEW RPC call ───
async function newRpcGetDashboardMetrics(today: string): Promise<DashboardMetrics> {
  const { data, error } = await supabase.rpc("get_dashboard_metrics", { p_today: today });
  if (error) throw error;
  const row: any = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("RPC returned no data");
  return {
    salesTodayCount: Number(row.sales_today_count ?? 0),
    billedToday: Number(row.billed_today ?? 0),
    cashCollectedToday: Number(row.cash_collected_today ?? 0),
    expensesToday: Number(row.expenses_today ?? 0),
    totalCustomers: Number(row.total_customers ?? 0),
    totalOutstanding: Number(row.total_outstanding ?? 0),
    overCreditLimitCount: Number(row.over_credit_limit_count ?? 0),
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

async function main() {
  const today = new Date().toISOString().split("T")[0];
  console.log(`🔍 Verifying get_dashboard_metrics('${today}') RPC vs TS logic...\n`);

  // Check if RPC exists
  try {
    const { error } = await supabase.rpc("get_dashboard_metrics", { p_today: today });
    if (error) {
      console.error("❌ RPC not deployed yet. Run supabase/add-dashboard-reconciliation-rpc.sql in Supabase SQL Editor first.\n");
      console.error("   Error:", error.message);
      process.exit(3);
    }
  } catch (e: any) {
    console.error("❌ RPC call failed:", e.message);
    process.exit(3);
  }

  console.log("✅ RPC is deployed. Running comparison...\n");

  const [oldM, newM] = await Promise.all([
    oldGetDashboardMetrics(today),
    newRpcGetDashboardMetrics(today),
  ]);

  const fields: Array<keyof DashboardMetrics> = [
    "salesTodayCount",
    "billedToday",
    "cashCollectedToday",
    "expensesToday",
    "totalCustomers",
    "totalOutstanding",
    "overCreditLimitCount",
  ];

  console.log("METRIC                  | OLD (TS)                | NEW (RPC)               | DIFF     | STATUS");
  console.log("------------------------|-------------------------|-------------------------|----------|--------");

  let allMatch = true;
  for (const f of fields) {
    const o = oldM[f];
    const n = newM[f];
    const diff = Math.abs(o - n);
    const status = diff < TOLERANCE ? "✓" : "✗ MISMATCH";
    if (diff >= TOLERANCE) allMatch = false;
    console.log(
      `${f.padEnd(24)}| ${fmt(o).padStart(23)} | ${fmt(n).padStart(23)} | ${fmt(diff).padStart(8)} | ${status}`
    );
  }

  console.log("\n─────────────────────────────────────────────────────────");
  if (allMatch) {
    console.log("✅ PASS — get_dashboard_metrics RPC matches TS logic EXACTLY.");
    console.log("   Safe to deploy the TS code. Fallback path will be dead code (kept for safety).");
    process.exit(0);
  } else {
    console.log("❌ FAIL — RPC output does NOT match TS logic.");
    console.log("   Do NOT deploy the TS code yet. Investigate mismatches above.");
    console.log("   To rollback: DROP FUNCTION public.get_dashboard_metrics(date);");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Script crashed:", err);
  process.exit(99);
});
