import { admin } from "@/lib/supabase/server-admin";
import { getGoodsSettlementsForCustomer } from "./purchases";

// ─── Dashboard metrics ───
export interface DashboardMetrics {
  salesTodayCount: number;
  billedToday: number;
  cashCollectedToday: number;
  expensesToday: number;
  totalCustomers: number;
  totalOutstanding: number;
  overCreditLimitCount: number;
}

const CREDIT_LIMIT = 3_000_000;

export async function getDashboardMetrics(today: string): Promise<DashboardMetrics> {
  // Try RPC first (single round-trip, all math done in Postgres).
  // Falls back to old multi-query logic if RPC is not deployed.
  try {
    const { data, error } = await admin.rpc("get_dashboard_metrics", { p_today: today });
    if (!error && data) {
      // RPC returns a single row (or array of 1 row depending on supabase-js version)
      const row: any = Array.isArray(data) ? data[0] : data;
      if (row) {
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
    }
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (!msg.includes("Could not find the function") && !msg.includes("does not exist")) {
      console.warn("getDashboardMetrics RPC failed, using fallback:", msg);
    }
  }

  // ─── Fallback: original TS logic (4 parallel queries via Promise.all) ───
  // Run all 4 independent queries in parallel — same result, ~3-4x faster than sequential.
  // Order of destructure matches order of promises.
  const [salesRes, expRes, custRes, allSalesRes] = await Promise.all([
    admin
      .from("sales")
      .select("quantity, rate_per_bag, rickshaw_fare, cash_received, customer_id")
      .eq("sale_date", today),
    admin
      .from("expenses")
      .select("amount")
      .eq("expense_date", today),
    admin
      .from("customers")
      .select("*", { count: "exact", head: true }),
    admin
      .from("sales")
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

  // Customer balances
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

// ─── Day Reconciliation (returns snake_case keys to match frontend) ───

export async function getReconciliation(fromDate: string, toDate: string): Promise<Record<string, any>> {
  // Try RPC first (single round-trip, all math done in Postgres).
  // Falls back to old multi-query logic if RPC is not deployed.
  try {
    const { data, error } = await admin.rpc("get_reconciliation", {
      p_from: fromDate,
      p_to: toDate,
    });
    if (!error && data) {
      // RPC returns a single JSON object — already in the right shape.
      // Normalize numbers (PG numerics arrive as strings sometimes via JSON).
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
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (!msg.includes("Could not find the function") && !msg.includes("does not exist")) {
      console.warn("getReconciliation RPC failed, using fallback:", msg);
    }
  }

  // ─── Fallback: original TS logic (2 queries + JS reduction) ───
  const { data: sales, error: sErr } = await admin
    .from("sales")
    .select("quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(type)")
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate);
  if (sErr) throw sErr;

  const { data: expenses, error: eErr } = await admin
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
    total_bags_sold,
    total_billed,
    cash_received,
    from_credit_customers,
    from_cash_customers,
    total_expenses,
    total_cash_in: cash_received,
    total_cash_out: total_expenses,
    expected_cash_in_hand: cash_received - total_expenses,
    expenses: ex,
  };
}

// ─── Customer Khata balance ───
// opening_balance = one-time previous balance entered by the shopkeeper.
// balance_due = opening_balance + total_bill - total_cash_paid - total_goods_value.
export interface CustomerBalanceInfo {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  balance_due: number;
}

export async function getCustomerBalance(customerId: number): Promise<CustomerBalanceInfo> {
  // Try RPC first (single round-trip, all math done in Postgres).
  // Falls back to old multi-query logic if RPC is not deployed.
  try {
    const { data: rpcRows, error } = await admin.rpc("get_all_customer_balances");
    if (!error && Array.isArray(rpcRows)) {
      const row = rpcRows.find((r: any) => Number(r.customer_id) === customerId);
      if (row) {
        return {
          opening_balance: Number(row.opening_balance ?? 0),
          total_bill: Number(row.total_bill ?? 0),
          total_cash_paid: Number(row.total_cash_paid ?? 0),
          total_goods_value: Number(row.total_goods_value ?? 0),
          balance_due: Number(row.balance_due ?? 0),
        };
      }
      // Customer exists but had no sales/purchases → return zeros (with opening_balance if any)
      const { data: cust } = await admin
        .from("customers")
        .select("opening_balance")
        .eq("id", customerId)
        .maybeSingle();
      const ob = Number(cust?.opening_balance ?? 0);
      return {
        opening_balance: ob,
        total_bill: 0,
        total_cash_paid: 0,
        total_goods_value: 0,
        balance_due: ob,
      };
    }
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (!msg.includes("Could not find the function") && !msg.includes("does not exist")) {
      // Unexpected RPC error — log and fall through to fallback
      console.warn("getCustomerBalance RPC failed, using fallback:", msg);
    }
  }

  // ─── Fallback: original TS logic (3 queries + JS reduction) ───
  // Fetch customer row to get opening_balance (defaults to 0 if customer missing)
  const { data: customer } = await admin
    .from("customers")
    .select("opening_balance")
    .eq("id", customerId)
    .maybeSingle();
  const opening_balance = (customer?.opening_balance as number) ?? 0;

  const { data: sales, error } = await admin
    .from("sales")
    .select("quantity, rate_per_bag, rickshaw_fare, cash_received")
    .eq("customer_id", customerId);
  if (error) throw error;

  const total_bill = (sales || []).reduce(
    (sum, s) => sum + (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number),
    0
  );
  const total_cash_paid = (sales || []).reduce((sum, s) => sum + (s.cash_received as number), 0);
  const total_goods_value = await getGoodsSettlementsForCustomer(customerId);

  return {
    opening_balance,
    total_bill,
    total_cash_paid,
    total_goods_value,
    balance_due: opening_balance + total_bill - total_cash_paid - total_goods_value,
  };
}

// ─── All customer balances at once ───
export async function getAllCustomerBalances(): Promise<Record<number, CustomerBalanceInfo>> {
  // Try RPC first (single round-trip, all math done in Postgres).
  // Falls back to old multi-query logic if RPC is not deployed.
  try {
    const { data: rpcRows, error } = await admin.rpc("get_all_customer_balances");
    if (!error && Array.isArray(rpcRows)) {
      const map: Record<number, CustomerBalanceInfo> = {};
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
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (!msg.includes("Could not find the function") && !msg.includes("does not exist")) {
      console.warn("getAllCustomerBalances RPC failed, using fallback:", msg);
    }
  }

  // ─── Fallback: original TS logic (3 queries + JS reduction) ───
  const { data: sales, error } = await admin
    .from("sales")
    .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received");
  if (error) throw error;

  const map: Record<number, CustomerBalanceInfo> = {};
  for (const s of sales || []) {
    const cid = s.customer_id as number;
    if (!map[cid]) map[cid] = { opening_balance: 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };
    map[cid].total_bill += (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
    map[cid].total_cash_paid += s.cash_received as number;
  }

  // Fetch goods settlements for all customers
  const { data: purchases } = await admin
    .from("purchases")
    .select("settled_by_customer_id, quantity, rate_per_bag")
    .not("settled_by_customer_id", "is", null);
  for (const p of purchases || []) {
    const cid = p.settled_by_customer_id as number;
    if (!map[cid]) map[cid] = { opening_balance: 0, total_bill: 0, total_cash_paid: 0, total_goods_value: 0, balance_due: 0 };
    map[cid].total_goods_value += (p.quantity as number) * (p.rate_per_bag as number);
  }

  // Fetch opening_balance for all customers in one shot
  const { data: customerRows } = await admin
    .from("customers")
    .select("id, opening_balance");
  const obMap: Record<number, number> = {};
  for (const c of customerRows || []) {
    obMap[c.id as number] = (c.opening_balance as number) ?? 0;
  }

  // Make sure every customer (even those with no sales but with an opening_balance)
  // appears in the map, then compute balance_due including opening_balance.
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
