-- ════════════════════════════════════════════════════════════════════════
-- Index Stats Reset — Per-Index (Alternative to pg_stat_reset)
-- ════════════════════════════════════════════════════════════════════════
-- pg_stat_reset() requires superuser privileges which Supabase SQL Editor
-- doesn't grant. This script tries pg_stat_reset_single_index_counters()
-- which has different permissions and may work in some Supabase setups.
--
-- If THIS also fails with permission denied, use Option 1 (Dashboard) or
-- Option 3 (just wait — natural traffic will clear the warnings).
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- STEP 1: View current index usage stats (always works — read-only)
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
-- STEP 2: Try per-index reset using a DO block (may still fail, but try)
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
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE NOTICE '⚠️ No permission to reset index OID % — use Dashboard or wait for natural traffic', idx_rec.indexrelid;
    EXCEPTION WHEN OTHERS THEN
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


-- ════════════════════════════════════════════════════════════════════════
-- IF BOTH pg_stat_reset() AND pg_stat_reset_single_index_counters() FAIL:
-- ════════════════════════════════════════════════════════════════════════
-- Don't worry. The 'unused_index' warnings are INFO-level and don't
-- affect app performance or security. They will naturally clear once:
--
-- 1. Production traffic accumulates (1-2 weeks of normal app usage)
-- 2. Or Supabase rotates the stats (happens periodically on its own)
--
-- The IMPORTANT thing is: DO NOT DROP these indexes. They ARE used:
--   - idx_app_customers_email → customer login (customer-db.ts:30)
--   - idx_cash_ledger_account_id → cash queries (cash.ts:57, 215)
--   - idx_customers_is_active → customers list (customers.ts:32)
--   - idx_labours_active → labours list (labours.ts:40)
--   - idx_labour_payments_type → payment filter (labours.ts:124)
--   - idx_product_stock_location_id → stock by location (stock.ts:28)
--
-- The 6 FK indexes (idx_*_fkey, idx_*_linked_*, idx_*_from/to_account_id,
-- idx_*_employee_id, idx_*_customer_id) are insurance indexes — they
-- only fire on parent row deletes. Showing 0 usage is CORRECT behavior.
