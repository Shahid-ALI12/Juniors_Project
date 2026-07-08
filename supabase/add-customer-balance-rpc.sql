-- ============================================================
-- Migration: Add get_all_customer_balances() RPC function
-- Date: 2026-07-08
-- Purpose: Move customer balance computation from Node.js to PostgreSQL
--          for better performance (single round-trip vs 3 queries + JS loop).
--
-- ⚠️ IMPORTANT: This migration is OPTIONAL for the app to work.
--   - The TS code has a fallback path that uses the old query logic
--     if this RPC is not deployed.
--   - To activate: run this file ONCE in Supabase SQL Editor.
--   - Safe to re-run (uses CREATE OR REPLACE).
--
-- Output shape (matches CustomerBalanceInfo interface in reports.ts):
--   customer_id      bigint
--   opening_balance  numeric
--   total_bill       numeric     (Σ quantity*rate_per_bag + rickshaw_fare from sales)
--   total_cash_paid  numeric     (Σ cash_received from sales)
--   total_goods_value numeric    (Σ quantity*rate_per_bag from purchases where settled_by_customer_id IS NOT NULL)
--   balance_due      numeric     (opening_balance + total_bill - total_cash_paid - total_goods_value)
--
-- Behavior matches the existing TS function exactly:
--   1. Every customer in `customers` table appears in the output (even with no sales).
--   2. Customer with sales but somehow missing from `customers` table does NOT appear
--      (TS function uses customerRows as the final iteration source).
--   3. NULL values are coalesced to 0 (defensive — schema has NOT NULL but be safe).
--   4. No is_active filter (matches TS behavior).
-- ============================================================

-- Drop old version if exists (idempotent)
DROP FUNCTION IF EXISTS public.get_all_customer_balances();

-- Create the function
CREATE OR REPLACE FUNCTION public.get_all_customer_balances()
RETURNS TABLE (
  customer_id       bigint,
  opening_balance   numeric,
  total_bill        numeric,
  total_cash_paid   numeric,
  total_goods_value numeric,
  balance_due       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id                                                            AS customer_id,
    COALESCE(c.opening_balance, 0)                                  AS opening_balance,
    COALESCE(s.total_bill, 0)                                       AS total_bill,
    COALESCE(s.total_cash_paid, 0)                                  AS total_cash_paid,
    COALESCE(p.total_goods_value, 0)                                AS total_goods_value,
    COALESCE(c.opening_balance, 0)
      + COALESCE(s.total_bill, 0)
      - COALESCE(s.total_cash_paid, 0)
      - COALESCE(p.total_goods_value, 0)                            AS balance_due
  FROM customers c
  -- Sales aggregation per customer (bill = qty*rate + rickshaw_fare)
  LEFT JOIN (
    SELECT
      customer_id,
      SUM(quantity * rate_per_bag + rickshaw_fare) AS total_bill,
      SUM(cash_received)                           AS total_cash_paid
    FROM sales
    GROUP BY customer_id
  ) s ON s.customer_id = c.id
  -- Goods settlements aggregation (purchases settled by this customer)
  LEFT JOIN (
    SELECT
      settled_by_customer_id,
      SUM(quantity * rate_per_bag) AS total_goods_value
    FROM purchases
    WHERE settled_by_customer_id IS NOT NULL
    GROUP BY settled_by_customer_id
  ) p ON p.settled_by_customer_id = c.id
  ORDER BY c.id;
END;
$$;

-- Grant execute to authenticated + anon (RLS for selects still applies at table level
-- for direct queries, but SECURITY DEFINER bypasses RLS for this function — same as
-- existing record_purchase, create_sale, etc. functions in all-rpc-functions.sql)
GRANT EXECUTE ON FUNCTION public.get_all_customer_balances() TO authenticated, anon;

-- ============================================================
-- Verification query (run manually to sanity-check):
-- SELECT * FROM get_all_customer_balances() ORDER BY customer_id LIMIT 10;
-- ============================================================

-- ============================================================
-- Rollback (if you ever want to remove this function):
-- DROP FUNCTION IF EXISTS public.get_all_customer_balances();
-- The TS code will automatically fall back to the old query logic.
-- ============================================================
