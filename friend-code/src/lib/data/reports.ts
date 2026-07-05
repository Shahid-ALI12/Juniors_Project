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

// ─── Day Reconciliation ───
export interface ReconciliationData {
  totalBagsSold: number;
  totalBilled: number;
  cashReceived: number;
  fromCreditCustomers: number;
  fromCashCustomers: number;
  totalExpenses: number;
  totalCashIn: number;
  totalCashOut: number;
  expectedCashInHand: number;
}

export async function getReconciliation(fromDate: string, toDate: string): Promise<ReconciliationData> {
  const { data: sales, error: sErr } = await admin
    .from("sales")
    .select("quantity, rate_per_bag, rickshaw_fare, cash_received, unit_type, customers(type)")
    .gte("sale_date", fromDate)
    .lte("sale_date", toDate);
  if (sErr) throw sErr;

  const { data: expenses, error: eErr } = await admin
    .from("expenses")
    .select("amount")
    .gte("expense_date", fromDate)
    .lte("expense_date", toDate);
  if (eErr) throw eErr;

  const sl = sales || [];
  const ex = expenses || [];

  const totalBagsSold = sl
    .filter((s) => s.unit_type === "bags")
    .reduce((sum, s) => sum + (s.quantity as number), 0);

  const totalBilled = sl.reduce(
    (sum, s) => sum + (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number),
    0
  );
  const cashReceived = sl.reduce((sum, s) => sum + (s.cash_received as number), 0);
  const totalExpenses = ex.reduce((sum, e) => sum + (e.amount as number), 0);

  const fromCredit = sl
    .filter((s) => (s.customers as unknown as Record<string, unknown>)?.type === "credit")
    .reduce((sum, s) => sum + (s.quantity as number) * (s.rate_per_bag as number) + (s.rickshaw_fare as number), 0);
  const fromCash = totalBilled - fromCredit;

  return {
    totalBagsSold,
    totalBilled,
    cashReceived,
    fromCreditCustomers: fromCredit,
    fromCashCustomers: fromCash,
    totalExpenses,
    totalCashIn: cashReceived,
    totalCashOut: totalExpenses,
    expectedCashInHand: cashReceived - totalExpenses,
  };
}

// ─── Customer Khata balance ───
export interface CustomerBalanceInfo {
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  balance_due: number;
}

export async function getCustomerBalance(customerId: number): Promise<CustomerBalanceInfo> {
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
    total_bill,
    total_cash_paid,
    total_goods_value,
    balance_due: total_bill - total_cash_paid - total_goods_value,
  };
}
