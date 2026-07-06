import { NextResponse } from "next/server";
import { admin } from "@/lib/supabase/server-admin";

// Diagnostic endpoint — tests Supabase connection, table existence, and RPC functions.
// Call: GET /api/debug/db-check
// No auth required — this is for debugging only. Remove in production if desired.

const TABLES = [
  "app_customers",
  "products",
  "locations",
  "customers",
  "suppliers",
  "product_stock",
  "sales",
  "expenses",
  "purchases",
  "cash_accounts",
  "cash_ledger",
  "cash_transfers",
  "mix_orders",
] as const;

const RPC_FUNCTIONS = [
  "verify_customer_login",
  "create_sale",
  "record_purchase",
  "record_expense",
  "transfer_cash",
  "correct_cash_balance",
  "create_mix_order",
] as const;

interface CheckResult {
  table: string;
  exists: boolean;
  rowCount?: number;
  error?: string;
}

interface RpcCheckResult {
  function: string;
  exists: boolean;
  error?: string;
}

export async function GET() {
  const results: {
    env: Record<string, boolean>;
    connection: { ok: boolean; error?: string };
    tables: CheckResult[];
    rpcs: RpcCheckResult[];
    seedData: Record<string, boolean>;
  } = {
    env: {
      NEXT_PUBLIC_SUPABASE_URL: !!(process.env.NEXT_PUBLIC_SUPABASE_URL && !process.env.NEXT_PUBLIC_SUPABASE_URL.includes("placeholder")),
      NEXT_PUBLIC_SUPABASE_KEY: !!(process.env.NEXT_PUBLIC_SUPABASE_KEY && !process.env.NEXT_PUBLIC_SUPABASE_KEY.includes("placeholder")),
      SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
      CUSTOMER_TOKEN_SECRET: !!process.env.CUSTOMER_TOKEN_SECRET,
    },
    connection: { ok: false },
    tables: [],
    rpcs: [],
    seedData: {},
  };

  // Test connection
  try {
    const { error } = await admin.from("app_customers").select("id").limit(1);
    if (error) {
      results.connection = { ok: false, error: error.message };
    } else {
      results.connection = { ok: true };
    }
  } catch (err: any) {
    results.connection = { ok: false, error: err.message || String(err) };
  }

  // Check tables
  for (const table of TABLES) {
    try {
      const { count, error } = await admin
        .from(table)
        .select("*", { count: "exact", head: true });
      if (error) {
        results.tables.push({ table, exists: false, error: error.message });
      } else {
        results.tables.push({ table, exists: true, rowCount: count ?? 0 });
      }
    } catch (err: any) {
      results.tables.push({ table, exists: false, error: err.message || String(err) });
    }
  }

  // Check RPC functions
  for (const fn of RPC_FUNCTIONS) {
    try {
      const { error } = await admin.rpc(fn);
      if (error) {
        const msg = error.message;
        const fnMissing = msg.includes("does not exist") && msg.includes("function");
        results.rpcs.push({
          function: fn,
          exists: !fnMissing,
          error: fnMissing ? "Function does not exist in database" : `Exists (test call error: ${msg})`,
        });
      } else {
        results.rpcs.push({ function: fn, exists: true });
      }
    } catch (err: any) {
      const msg = err?.message || String(err);
      const fnMissing = msg.includes("does not exist") && msg.includes("function");
      results.rpcs.push({
        function: fn,
        exists: !fnMissing,
        error: fnMissing ? "Function does not exist in database" : `Exists (test call error: ${msg})`,
      });
    }
  }

  // Check seed data
  try {
    const { data: locs } = await admin.from("locations").select("name");
    const locNames = new Set((locs || []).map((l: any) => l.name));
    results.seedData["locations (Farm, Shop)"] = locNames.has("Farm") && locNames.has("Shop");

    const { data: accts } = await admin.from("cash_accounts").select("name");
    const acctNames = new Set((accts || []).map((a: any) => a.name));
    results.seedData["cash_accounts (Cash In Hand)"] = acctNames.has("Cash In Hand");

    const { count: prodCount } = await admin.from("products").select("*", { count: "exact", head: true });
    results.seedData["products (seeded)"] = (prodCount ?? 0) > 0;
  } catch {
    results.seedData = { error: "Could not check seed data" } as any;
  }

  // Summary
  const missingTables = results.tables.filter((t) => !t.exists).map((t) => t.table);
  const missingRpcs = results.rpcs.filter((r) => !r.exists).map((r) => r.function);

  const summary: string[] = [];
  if (!results.env.NEXT_PUBLIC_SUPABASE_URL) summary.push("NEXT_PUBLIC_SUPABASE_URL not set");
  if (!results.env.NEXT_PUBLIC_SUPABASE_KEY) summary.push("NEXT_PUBLIC_SUPABASE_KEY not set");
  if (!results.env.SUPABASE_SERVICE_ROLE_KEY) summary.push("SUPABASE_SERVICE_ROLE_KEY not set");
  if (!results.env.CUSTOMER_TOKEN_SECRET) summary.push("CUSTOMER_TOKEN_SECRET not set");
  if (!results.connection.ok) summary.push(`Connection failed: ${results.connection.error}`);
  if (missingTables.length > 0) summary.push(`Missing tables: ${missingTables.join(", ")}`);
  if (missingRpcs.length > 0) summary.push(`Missing RPC functions: ${missingRpcs.join(", ")}`);

  return NextResponse.json({
    status: summary.length === 0 ? "ALL OK" : "ISSUES FOUND",
    summary: summary.length > 0 ? summary : undefined,
    ...results,
  });
}