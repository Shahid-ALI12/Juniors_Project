-- ════════════════════════════════════════════════════════════════════════
-- FIX: Add covering index on purchases.supplier_id (FK referential integrity)
-- ════════════════════════════════════════════════════════════════════════
-- Issue:
--   unindexed_foreign_keys on public.purchases.purchases_supplier_id_fkey
--   Column: supplier_id (FK → suppliers.id)
--
-- Background:
--   In the previous fix-info-advisor.sql, idx_purchases_supplier_id was
--   DROPPED because it was unused for QUERIES (no .eq("supplier_id") in
--   code). That was correct for query performance.
--
--   HOWEVER, FK indexes serve a SECOND purpose: referential integrity.
--   When you DELETE a row from suppliers (parent), Postgres must scan
--   purchases (child) to verify no purchases reference that supplier.
--   Without an index, this is a sequential scan → slow on large tables.
--
--   The unindexed_foreign_keys advisor warning is about THIS concern
--   (referential integrity), not query performance. So we add the index
--   back, with a clear name indicating its purpose.
--
-- Note:
--   This index WILL show as "unused_index" in the advisor until a
--   supplier is deleted (which triggers the FK check). That's expected
--   behavior for FK-only indexes — they're insurance, not query backers.
--
-- Safety:
--   - Adding an index is non-blocking (CONCURRENTLY not needed for small tables)
--   - No app behavior change
--   - Pure performance improvement for supplier deletions
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- Add FK covering index on purchases.supplier_id
-- (Use a descriptive name to indicate this is for FK integrity, not queries)
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id_fkey
  ON public.purchases (supplier_id);


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════════

-- Confirm index exists
SELECT
  tablename AS table_name,
  indexname AS index_name,
  indexdef AS definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'purchases'
  AND indexname = 'idx_purchases_supplier_id_fkey';
-- Expected: 1 row


-- Check all FK indexes are in place (this + the 5 added in previous fix)
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS fk_constraint_name,
  a.attname AS fk_column,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_index i
      WHERE i.indrelid = con.conrelid
        AND i.indkey[0] = con.conkey[1]
        AND i.indisvalid
    ) THEN '✅ Has covering index'
    ELSE '❌ MISSING covering index'
  END AS status
FROM pg_constraint con
JOIN pg_class c ON con.conrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
WHERE n.nspname = 'public'
  AND con.contype = 'f'  -- foreign key
  AND c.relname IN (
    'app_customers','cash_transfers','employee_salaries','mix_orders','purchases'
  )
ORDER BY c.relname, con.conname;
-- Expected: every row shows '✅ Has covering index'


-- ════════════════════════════════════════════════════════════════════════
-- ABOUT THE 11 REMAINING unused_index WARNINGS
-- ════════════════════════════════════════════════════════════════════════
-- These will PERSIST after running this script. Here's why they're OK:
--
-- GROUP A — 5 newly created FK indexes (just added in fix-info-advisor.sql):
--   idx_app_customers_linked_customer_id
--   idx_cash_transfers_from_account_id
--   idx_cash_transfers_to_account_id
--   idx_employee_salaries_employee_id
--   idx_mix_orders_customer_id
-- These are "insurance" indexes — they back referential integrity checks
-- that only fire when a parent row is deleted. Until you delete a parent
-- row, they show 0 usage. This is correct behavior. Do NOT drop them.
--
-- GROUP B — 6 indexes backing live queries (low traffic):
--   idx_app_customers_email      (customer login — customer-db.ts:30)
--   idx_cash_ledger_account_id   (cash ledger queries — cash.ts:57,215)
--   idx_customers_is_active      (active customers list — customers.ts:32)
--   idx_labours_active           (active labours list — labours.ts:40)
--   idx_labour_payments_type     (payment filter — labours.ts:124)
--   idx_product_stock_location_id (stock by location — stock.ts:28)
-- These ARE used in production code, but traffic is currently low so
-- Postgres stats show 0 usage. Once production traffic accumulates over
-- 1-2 weeks, the advisor will stop flagging them.
--
-- TO FORCE STAT RESET (optional):
--   SELECT pg_stat_reset_single_index_counters(<index_oid>);
--   (run individually for each index you want to reset, or just wait
--    for natural traffic)
--
-- DO NOT DROP ANY OF THESE 11 INDEXES — they are all needed.


-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK
-- ════════════════════════════════════════════════════════════════════════
-- DROP INDEX IF EXISTS public.idx_purchases_supplier_id_fkey;
