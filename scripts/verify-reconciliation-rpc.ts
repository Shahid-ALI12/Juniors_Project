/**
 * Verification Script: get_reconciliation RPC vs original TS logic
 *
 * Run AFTER deploying `supabase/add-dashboard-reconciliation-rpc.sql` to Supabase.
 *
 * HOW TO RUN:
 *   npx tsx scripts/verify-reconciliation-rpc.ts [from-date] [to-date]
 *
 *   Default: last 7 days (today - 6 days → today)
 *
 * OUTPUT:
 *   - Comparison of all 9 numeric fields + expenses array length
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

const TOLERANCE = 0.01;

interface ReconciliationResult {
  total_bags_sold: number;
  total_billed: number;
  cash_received: number;
  from_credit_customers: number;
  from_cash_customers: number;
  total_expenses: number;
  total_cash_in: number;
  total_cash_out: number;
  expected_cash_in_hand: number;
  expenses: any[];
}

// ─── OLD TS logic (verbatim from reports.ts pre-RPC) ───
async function oldGetReconciliation(fromDate: string, toDate: string): Promise<ReconciliationResult> {
  const { data: sales, error: sErr } = await supabase
    .from("sales")
    .select("quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(type)")
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate);
  if (sErr) throw sErr;

  const { data: expenses, error: eErr } = await supabase
    .from("expenses")
    .select("*")
    .gte("expense_date", fromDate)
    .lte("expense_date", toDate)
    .order("expense_date", { ascending: true });
  if (eErr) throw eErr;

  const sl = sales || [];
  const ex = expenses || [];

  const total_bags_sold = sl
    .filter((s) => s.unit_type === "bags")
    .reduce((sum, s) => sum + (s.quantity as number), 0);
  const total_billed = sl.reduce(
    (sum, s) => sum + (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number),
    0
  );
  const cash_received = sl.reduce((sum, s) => sum + (s.cash_received as number), 0);
  const total_expenses = ex.reduce((sum, e) => sum + (e.amount as number), 0);
  const from_credit_customers = sl
    .filter((s) => (s.customers as unknown as Record<string, unknown>)?.type === "credit")
    .reduce((sum, s) => sum + (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number), 0);
  const from_cash_customers = total_billed - from_credit_customers;

  return {
    total_bags_sold, total_billed, cash_received,
    from_credit_customers, from_cash_customers,
    total_expenses,
    total_cash_in: cash_received,
    total_cash_out: total_expenses,
    expected_cash_in_hand: cash_received - total_expenses,
    expenses: ex,
  };
}

// ─── NEW RPC call ───
async function newRpcGetReconciliation(fromDate: string, toDate: string): Promise<ReconciliationResult> {
  const { data, error } = await supabase.rpc("get_reconciliation", {
    p_from: fromDate,
    p_to: toDate,
  });
  if (error) throw error;
  const obj = data as any;
  return {
    total_bags_sold: Number(obj.total_bags_sold ?? 0),
    total_billed: Number(obj.total_billed ?? 0),
    cash_received: Number(obj.cash_received ?? 0),
    from_credit_customers: Number(obj.from_credit_customers ?? 0),
    from_cash_customers: Number(obj.from_cash_customers ?? 0),
    total_expenses: Number(obj.total_expenses ?? 0),
    total_cash_in: Number(obj.total_cash_in ?? 0),
    total_cash_out: Number(obj.total_cash_out ?? 0),
    expected_cash_in_hand: Number(obj.expected_cash_in_hand ?? 0),
    expenses: Array.isArray(obj.expenses) ? obj.expenses : [],
  };
}

function fmt(n: number): string {
  return n.toLocaleString("en-PK", { maximumFractionDigits: 2 });
}

async function main() {
  // Args: [from-date] [to-date], default = last 7 days
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const fromDate = process.argv[2] || weekAgo.toISOString().split("T")[0];
  const toDate = process.argv[3] || today.toISOString().split("T")[0];

  console.log(`🔍 Verifying get_reconciliation('${fromDate}', '${toDate}') RPC vs TS logic...\n`);

  // Check if RPC exists
  try {
    const { error } = await supabase.rpc("get_reconciliation", {
      p_from: fromDate,
      p_to: toDate,
    });
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

  const [oldR, newR] = await Promise.all([
    oldGetReconciliation(fromDate, toDate),
    newRpcGetReconciliation(fromDate, toDate),
  ]);

  const numericFields: Array<keyof ReconciliationResult> = [
    "total_bags_sold",
    "total_billed",
    "cash_received",
    "from_credit_customers",
    "from_cash_customers",
    "total_expenses",
    "total_cash_in",
    "total_cash_out",
    "expected_cash_in_hand",
  ];

  console.log("FIELD                    | OLD (TS)                | NEW (RPC)               | DIFF     | STATUS");
  console.log("-------------------------|-------------------------|-------------------------|----------|--------");

  let allMatch = true;
  for (const f of numericFields) {
    const o = oldR[f] as number;
    const n = newR[f] as number;
    const diff = Math.abs(o - n);
    const status = diff < TOLERANCE ? "✓" : "✗ MISMATCH";
    if (diff >= TOLERANCE) allMatch = false;
    console.log(
      `${f.padEnd(25)}| ${fmt(o).padStart(23)} | ${fmt(n).padStart(23)} | ${fmt(diff).padStart(8)} | ${status}`
    );
  }

  // Compare expenses arrays (count + total amount)
  const oldExpCount = oldR.expenses.length;
  const newExpCount = newR.expenses.length;
  const oldExpSum = oldR.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const newExpSum = newR.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const expCountMatch = oldExpCount === newExpCount;
  const expSumMatch = Math.abs(oldExpSum - newExpSum) < TOLERANCE;
  if (!expCountMatch || !expSumMatch) allMatch = false;

  console.log(`${"expenses.length".padEnd(25)}| ${String(oldExpCount).padStart(23)} | ${String(newExpCount).padStart(23)} | ${String(Math.abs(oldExpCount - newExpCount)).padStart(8)} | ${expCountMatch ? "✓" : "✗ MISMATCH"}`);
  console.log(`${"expenses.amount_sum".padEnd(25)}| ${fmt(oldExpSum).padStart(23)} | ${fmt(newExpSum).padStart(23)} | ${fmt(Math.abs(oldExpSum - newExpSum)).padStart(8)} | ${expSumMatch ? "✓" : "✗ MISMATCH"}`);

  console.log("\n─────────────────────────────────────────────────────────");
  if (allMatch) {
    console.log("✅ PASS — get_reconciliation RPC matches TS logic EXACTLY.");
    console.log("   Safe to deploy the TS code. Fallback path will be dead code (kept for safety).");
    process.exit(0);
  } else {
    console.log("❌ FAIL — RPC output does NOT match TS logic.");
    console.log("   Do NOT deploy the TS code yet. Investigate mismatches above.");
    console.log("   To rollback: DROP FUNCTION public.get_reconciliation(date, date);");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Script crashed:", err);
  process.exit(99);
});
