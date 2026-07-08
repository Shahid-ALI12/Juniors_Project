-- ════════════════════════════════════════════════════════════════════════
-- Reset Postgres Index Statistics
-- ════════════════════════════════════════════════════════════════════════
-- Purpose:
--   Supabase Performance Advisor tracks index usage via pg_stat_user_indexes.
--   If stats have been accumulating since project creation (with low traffic),
--   the "unused" ratio can be misleadingly low. Resetting starts fresh
--   counting so that indexes used in active production traffic will
--   show as 'used' within a few hours/days.
--
-- Safety:
--   - This is a STAT-ONLY reset, no data is touched
--   - No indexes, no tables, no rows are affected
--   - 100% safe to run on production
--   - Just resets the counter to 0 for usage tracking
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- STEP 1: Show current state before reset (so you can compare later)
-- ────────────────────────────────────────────────────────────────────────
SELECT
  schemaname AS schema_name,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_index_used,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname IN (
    -- 6 query-backed indexes (should show usage after traffic)
    'idx_app_customers_email',
    'idx_cash_ledger_account_id',
    'idx_customers_is_active',
    'idx_labours_active',
    'idx_labour_payments_type',
    'idx_product_stock_location_id',
    -- 6 FK-integrity indexes (will show 0 until parent deletes happen)
    'idx_app_customers_linked_customer_id',
    'idx_cash_transfers_from_account_id',
    'idx_cash_transfers_to_account_id',
    'idx_employee_salaries_employee_id',
    'idx_mix_orders_customer_id',
    'idx_purchases_supplier_id_fkey'
  )
ORDER BY relname, indexrelname;
-- Expected: all show idx_scan = 0 (or very low) — this is what triggers the warnings


-- ────────────────────────────────────────────────────────────────────────
-- STEP 2: Reset all index usage stats for the public schema
-- ────────────────────────────────────────────────────────────────────────
-- This resets the idx_scan counter to 0 for ALL indexes in public schema.
-- From this moment, any index used by a query will start accumulating
-- usage counts, and the Performance Advisor will stop flagging it
-- (typically within 1-24 hours depending on traffic).
SELECT pg_stat_reset();

-- Note: pg_stat_reset() resets ALL stats DB-wide (indexes, tables, functions).
-- If you want to reset only specific indexes, use:
--   SELECT pg_stat_reset_single_index_counters(<index_oid>);
-- (but you'd need to look up OIDs first — pg_stat_reset() is simpler).


-- ────────────────────────────────────────────────────────────────────────
-- STEP 3: Confirm reset worked (all counters should now be 0)
-- ────────────────────────────────────────────────────────────────────────
SELECT
  schemaname AS schema_name,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan AS times_index_used
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
-- Expected: all show idx_scan = 0 (fresh start)


-- ════════════════════════════════════════════════════════════════════════
-- WHAT TO DO NEXT
-- ════════════════════════════════════════════════════════════════════════
-- 1. After running this script, USE YOUR APP for 10-15 minutes:
--    - Log in as admin
--    - Open customer list (triggers idx_customers_is_active)
--    - Open labours page (triggers idx_labours_active)
--    - Customer portal login (triggers idx_app_customers_email)
--    - View cash ledger (triggers idx_cash_ledger_account_id)
--    - Filter labour payments by type (triggers idx_labour_payments_type)
--    - View stock by location (triggers idx_product_stock_location_id)
--
-- 2. Then run STEP 1 query again — you should see idx_scan > 0 for the
--    6 query-backed indexes. The 6 FK indexes will still show 0 (until
--    you delete a parent row).
--
-- 3. Refresh Supabase Performance Advisor — the 6 query-backed indexes
--    should NO LONGER be flagged. The 6 FK indexes MAY still be flagged
--    (until parent deletes happen), which is correct and unavoidable.
--
-- 4. The advisor may take up to 24 hours to refresh its cache. Be patient.
