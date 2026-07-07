-- ════════════════════════════════════════════════════════════════════════
-- Index Stats Reset — Per-Index (v3 — fixed EXCEPTION syntax)
-- ════════════════════════════════════════════════════════════════════════
-- pg_stat_reset() requires superuser privileges which Supabase SQL Editor
-- doesn't grant. This script tries pg_stat_reset_single_index_counters()
-- per-index, with proper EXCEPTION syntax (single EXCEPTION block with
-- multiple WHEN clauses, not multiple EXCEPTION keywords).
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- STEP 1: View current index usage stats (read-only, always works)
-- ────────────────────────────────────────────────────────────────────────
SELECT
  schemaname AS schema_name,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_used,
  idx_tup_read AS tuples_read
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname IN (
    'idx_app_customers_email',
    'idx_cash_ledger_account_id',
    'idx_customers_is_active',
    'idx_labours_active',
    'idx_labour_payments_type',
    'idx_product_stock_location_id',
    'idx_app_customers_linked_customer_id',
    'idx_cash_transfers_from_account_id',
    'idx_cash_transfers_to_account_id',
    'idx_employee_salaries_employee_id',
    'idx_mix_orders_customer_id',
    'idx_purchases_supplier_id_fkey'
  )
ORDER BY relname, indexrelname;


-- ────────────────────────────────────────────────────────────────────────
-- STEP 2: Try per-index reset using a DO block
-- (Single EXCEPTION block with multiple WHEN clauses — correct syntax)
-- ────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  idx_rec RECORD;
BEGIN
  FOR idx_rec IN
    SELECT s.indexrelid
    FROM pg_stat_user_indexes s
    JOIN pg_index i ON i.indexrelid = s.indexrelid
    WHERE s.schemaname = 'public'
      AND s.indexrelname IN (
        'idx_app_customers_email',
        'idx_cash_ledger_account_id',
        'idx_customers_is_active',
        'idx_labours_active',
        'idx_labour_payments_type',
        'idx_product_stock_location_id',
        'idx_app_customers_linked_customer_id',
        'idx_cash_transfers_from_account_id',
        'idx_cash_transfers_to_account_id',
        'idx_employee_salaries_employee_id',
        'idx_mix_orders_customer_id',
        'idx_purchases_supplier_id_fkey'
      )
  LOOP
    BEGIN
      PERFORM pg_stat_reset_single_index_counters(idx_rec.indexrelid);
      RAISE NOTICE '✅ Reset stats for index OID %', idx_rec.indexrelid;
    EXCEPTION
      WHEN insufficient_privilege THEN
        RAISE NOTICE '⚠️ No permission to reset index OID % — use Dashboard or wait for natural traffic', idx_rec.indexrelid;
      WHEN OTHERS THEN
        RAISE NOTICE '⚠️ Error resetting index OID %: %', idx_rec.indexrelid, SQLERRM;
    END;
  END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────────────
-- STEP 3: Verify reset (if permissions allowed it)
-- ────────────────────────────────────────────────────────────────────────
SELECT
  schemaname AS schema_name,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_used_after_reset
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname IN (
    'idx_app_customers_email',
    'idx_cash_ledger_account_id',
    'idx_customers_is_active',
    'idx_labours_active',
    'idx_labour_payments_type',
    'idx_product_stock_location_id',
    'idx_app_customers_linked_customer_id',
    'idx_cash_transfers_from_account_id',
    'idx_cash_transfers_to_account_id',
    'idx_employee_salaries_employee_id',
    'idx_mix_orders_customer_id',
    'idx_purchases_supplier_id_fkey'
  )
ORDER BY relname, indexrelname;
-- If reset worked: all idx_scan = 0
-- If reset failed: same numbers as STEP 1
