-- ============================================================
-- Migration: Add get_dashboard_metrics() + get_reconciliation() RPCs
-- Date: 2026-07-08
-- Purpose: Move heavy aggregation queries from Node.js to PostgreSQL
--          for single round-trip responses.
--
-- ⚠️ SAFETY:
--   - TS code has fallback path that uses old query logic if RPC not deployed.
--   - Output shape matches TS function returns EXACTLY.
--   - Idempotent: uses CREATE OR REPLACE.
--   - To activate: run this file ONCE in Supabase SQL Editor.
--
-- TO VERIFY: use scripts/verify-dashboard-rpc.ts and
--            scripts/verify-reconciliation-rpc.ts after deploying.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. get_dashboard_metrics(p_today date)
-- ════════════════════════════════════════════════════════════
-- Returns the 7 metrics that the dashboard needs in 1 round-trip:
--   sales_today_count       — COUNT of sales where sale_date = today
--   billed_today            — Σ (qty*rate + rickshaw_fare) for today
--   cash_collected_today    — Σ cash_received for today
--   expenses_today          — Σ amount for today's expenses
--   total_customers         — COUNT of all customers
--   total_outstanding       — Σ (bill - cash_received) for ALL sales
--   over_credit_limit_count — COUNT of customers with outstanding > 3,000,000
--
-- Matches getDashboardMetrics() in src/lib/data/reports.ts EXACTLY.
-- Note: uses the same inline customer balance calc (NOT the
-- get_all_customer_balances() RPC) so numbers match the current logic.
-- ============================================================

DROP FUNCTION IF EXISTS public.get_dashboard_metrics(date);

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(p_today date)
RETURNS TABLE (
  sales_today_count       bigint,
  billed_today            numeric,
  cash_collected_today    numeric,
  expenses_today          numeric,
  total_customers         bigint,
  total_outstanding       numeric,
  over_credit_limit_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_sales   bigint;
  v_today_billed  numeric := 0;
  v_today_cash    numeric := 0;
  v_today_exp     numeric := 0;
  v_cust_count    bigint;
  v_outstanding   numeric := 0;
  v_over_credit   bigint := 0;
  v_credit_limit  numeric := 3000000;
  v_bal           numeric;
  v_cid           bigint;
BEGIN
  -- ─── Today's sales aggregations (single scan with index) ───
  SELECT
    COUNT(*),
    COALESCE(SUM(quantity * rate_per_bag + rickshaw_fare), 0),
    COALESCE(SUM(cash_received), 0)
  INTO v_today_sales, v_today_billed, v_today_cash
  FROM sales
  WHERE sale_date = p_today;

  -- ─── Today's expenses ───
  SELECT COALESCE(SUM(amount), 0)
  INTO v_today_exp
  FROM expenses
  WHERE expense_date = p_today;

  -- ─── Total customers count ───
  SELECT COUNT(*)
  INTO v_cust_count
  FROM customers;

  -- ─── Outstanding balances per customer (cursor for low memory) ───
  -- Match the inline TS logic: balance = Σ(qty*rate + fare) - Σ(cash_received)
  -- Note: does NOT include opening_balance (same as current TS getDashboardMetrics)
  FOR v_cid, v_bal IN
    SELECT
      customer_id,
      SUM(quantity * rate_per_bag + rickshaw_fare) - SUM(cash_received)
    FROM sales
    GROUP BY customer_id
  LOOP
    v_outstanding := v_outstanding + v_bal;
    IF v_bal > v_credit_limit THEN
      v_over_credit := v_over_credit + 1;
    END IF;
  END LOOP;

  RETURN QUERY
  SELECT
    v_today_sales,
    v_today_billed,
    v_today_cash,
    v_today_exp,
    v_cust_count,
    v_outstanding,
    v_over_credit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(date) TO authenticated, anon;

-- ════════════════════════════════════════════════════════════
-- 2. get_reconciliation(p_from date, p_to date)
-- ════════════════════════════════════════════════════════════
-- Returns the reconciliation summary + expenses list in 1 round-trip.
-- Output is a single JSON object (because the expenses array varies in size).
--
-- Matches getReconciliation() in src/lib/data/reports.ts EXACTLY.
-- Returns JSON with keys:
--   total_bags_sold, total_billed, cash_received,
--   from_credit_customers, from_cash_customers,
--   total_expenses, total_cash_in, total_cash_out,
--   expected_cash_in_hand, expenses (array of expense rows)
-- ============================================================

DROP FUNCTION IF EXISTS public.get_reconciliation(date, date);

CREATE OR REPLACE FUNCTION public.get_reconciliation(p_from date, p_to date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_bags        numeric := 0;
  v_total_billed      numeric := 0;
  v_cash_received     numeric := 0;
  v_from_credit       numeric := 0;
  v_from_cash         numeric := 0;
  v_total_expenses    numeric := 0;
  v_expenses_json     json;
BEGIN
  -- ─── Sales aggregation in single scan ───
  SELECT
    COALESCE(SUM(CASE WHEN unit_type = 'bags' THEN quantity ELSE 0 END), 0),
    COALESCE(SUM(quantity * rate_per_bag + rickshaw_fare), 0),
    COALESCE(SUM(cash_received), 0),
    COALESCE(SUM(CASE WHEN customers.type = 'credit'
                      THEN quantity * rate_per_bag + rickshaw_fare
                      ELSE 0 END), 0)
  INTO v_total_bags, v_total_billed, v_cash_received, v_from_credit
  FROM sales
  LEFT JOIN customers ON customers.id = sales.customer_id
  WHERE sale_date >= p_from AND sale_date <= p_to;

  v_from_cash := v_total_billed - v_from_credit;

  -- ─── Expenses aggregation + array fetch in single pass ───
  -- We need both: SUM(amount) AND the full rows array
  -- Use a CTE-like approach: fetch as JSON array, then SUM via subquery
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_expenses
  FROM expenses
  WHERE expense_date >= p_from AND expense_date <= p_to;

  SELECT COALESCE(json_agg(json_build_object(
    'id', e.id,
    'expense_date', e.expense_date,
    'description', e.description,
    'amount', e.amount,
    'category', e.category,
    'created_at', e.created_at,
    'entered_by', e.entered_by
  ) ORDER BY e.expense_date ASC), '[]'::json)
  INTO v_expenses_json
  FROM expenses e
  WHERE e.expense_date >= p_from AND e.expense_date <= p_to;

  RETURN json_build_object(
    'total_bags_sold', v_total_bags,
    'total_billed', v_total_billed,
    'cash_received', v_cash_received,
    'from_credit_customers', v_from_credit,
    'from_cash_customers', v_from_cash,
    'total_expenses', v_total_expenses,
    'total_cash_in', v_cash_received,
    'total_cash_out', v_total_expenses,
    'expected_cash_in_hand', v_cash_received - v_total_expenses,
    'expenses', v_expenses_json
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reconciliation(date, date) TO authenticated, anon;

-- ============================================================
-- Verification queries (run manually):
-- SELECT * FROM get_dashboard_metrics(CURRENT_DATE);
-- SELECT * FROM get_reconciliation('2026-07-01', '2026-07-08');
-- ============================================================

-- ============================================================
-- ROLLBACK:
-- DROP FUNCTION IF EXISTS public.get_dashboard_metrics(date);
-- DROP FUNCTION IF EXISTS public.get_reconciliation(date, date);
-- TS code auto-falls-back to old logic. No code revert needed.
-- ============================================================
