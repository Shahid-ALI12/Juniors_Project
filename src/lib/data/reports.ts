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
  // Sales today
  const { data: todaySales, error: sErr } = await admin
    .from("sales")
    .select("quantity, rate_per_bag, rickshaw_fare, cash_received, customer_id")
    .eq("sale_date", today);
  if (sErr) throw sErr;

  // Expenses today
  const { data: todayExp, error: eErr } = await admin
    .from("expenses")
    .select("amount")
    .eq("expense_date", today);
  if (eErr) throw eErr;

  // All customers count
  const { count: custCount, error: cErr } = await admin
    .from("customers")
    .select("*", { count: "exact", head: true });
  if (cErr) throw cErr;

  // All sales (for customer balances)
  const { data: allSales, error: aErr } = await admin
    .from("sales")
    .select("customer_id, quantity, rate_per_bag, rickshaw_fare, cash_received");
  if (aErr) throw aErr;

  // Customer balances
  const balances: Record<number, number> = {};
  for (const s of allSales || []) {
    const bill = (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number);
    const cid = s.customer_id as number;
    balances[cid] = (balances[cid] || 0) + bill - (s.cash_received as number);
  }

  const sales = todaySales || [];
  const expenses = todayExp || [];

  return {
    salesTodayCount: sales.length,
    billedToday: sales.reduce((s, x) => s + (x.quantity as number) * (x.rate_per_bag as number) + (x.rickshaw_fare as number), 0),
    cashCollectedToday: sales.reduce((s, x) => s + (x.cash_received as number), 0),
    expensesToday: expenses.reduce((s, x) => s + (x.amount as number), 0),
    totalCustomers: custCount ?? 0,
    totalOutstanding: Object.values(balances).reduce((a, b) => a + b, 0),
    overCreditLimitCount: Object.values(balances).filter((b) => b > CREDIT_LIMIT).length,
  };
}

// ─── Day Reconciliation (returns snake_case keys to match frontend) ───

export async function getReconciliation(fromDate: string, toDate: string): Promise<Record<string, any>> {
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
