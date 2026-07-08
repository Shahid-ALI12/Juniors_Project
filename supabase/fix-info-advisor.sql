-- ════════════════════════════════════════════════════════════════════════
-- FIX: Supabase Performance Advisor INFO Warnings (20 total)
-- ════════════════════════════════════════════════════════════════════════
-- Two categories:
--   1. unindexed_foreign_keys  (5)  — ADD covering indexes on FK columns
--   2. unused_index            (15) — DROP 9 truly unused, KEEP 6 used in code
--
-- The "unused_index" warnings were audited against the codebase:
--   - 9 indexes: column never used in .eq()/.in()/.order() in any .ts file
--                → DROP (safe, no query will slow down)
--   - 6 indexes: column IS used in live queries (e.g. app_customers.email
--                for login lookup) → KEEP (advisor warning will persist,
--                but dropping would regress production queries)
--
-- The 6 KEPT indexes:
--   idx_cash_ledger_account_id     — used at cash.ts:57, 215
--   idx_product_stock_location_id  — used at stock.ts:28
--   idx_customers_is_active        — used at customers.ts:32
--   idx_labours_active             — used at labours.ts:40
--   idx_app_customers_email        — used at customer-db.ts:30 (login)
--   idx_labour_payments_type       — used at labours.ts:124
--
-- Safety:
--   - Adding FK indexes is pure win (no downside, faster JOINs/deletes)
--   - Dropping truly unused indexes saves disk + write overhead, no query impact
--   - service_role bypasses RLS but indexes still help it; no app behavior change
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 1: ADD COVERING INDEXES ON UNINDEXED FOREIGN KEYS (5 warnings → 0)
-- ────────────────────────────────────────────────────────────────────────
-- When you DELETE a row from a parent table, Postgres must scan the child
-- table for matching FK values. Without an index on the child FK column,
-- this becomes a sequential scan → slow on large tables. These indexes
-- fix that.

-- 1.1 app_customers.linked_customer_id (FK → customers.id)
CREATE INDEX IF NOT EXISTS idx_app_customers_linked_customer_id
  ON public.app_customers (linked_customer_id);

-- 1.2 cash_transfers.from_account_id (FK → cash_accounts.id)
CREATE INDEX IF NOT EXISTS idx_cash_transfers_from_account_id
  ON public.cash_transfers (from_account_id);

-- 1.3 cash_transfers.to_account_id (FK → cash_accounts.id)
CREATE INDEX IF NOT EXISTS idx_cash_transfers_to_account_id
  ON public.cash_transfers (to_account_id);

-- 1.4 employee_salaries.employee_id (FK → employees.id)
CREATE INDEX IF NOT EXISTS idx_employee_salaries_employee_id
  ON public.employee_salaries (employee_id);

-- 1.5 mix_orders.customer_id (FK → customers.id)
CREATE INDEX IF NOT EXISTS idx_mix_orders_customer_id
  ON public.mix_orders (customer_id);


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 2: DROP 9 TRULY UNUSED INDEXES (9 of 15 unused_index warnings → 0)
-- ────────────────────────────────────────────────────────────────────────
-- Audit confirmed: these columns are NEVER used in .eq()/.in()/.order()
-- in any TypeScript file. They are either:
--   - only SELECTed (no filter)
--   - filtered in JavaScript after fetching (not in DB query)
--   - the column doesn't even exist (idx_cash_ledger_source — real column
--     is `source_type`)
--   - the table is never queried by app code (utility_bills, employee_salaries)
--
-- Dropping them:
--   - Saves disk space
--   - Saves write overhead on every INSERT/UPDATE
--   - No query will regress (verified via codebase audit)
--
-- NOTE: The remaining 6 unused_index warnings (idx_app_customers_email,
-- idx_cash_ledger_account_id, idx_customers_is_active, idx_labours_active,
-- idx_labour_payments_type, idx_product_stock_location_id) WILL PERSIST
-- because those indexes back live queries. The advisor flags them because
-- stats were recently reset or traffic is low. Do NOT drop them.

-- 2.1 cash_ledger.direction — only SELECTed, never filtered
DROP INDEX IF EXISTS public.idx_cash_ledger_direction;

-- 2.2 cash_ledger.source — column doesn't exist (real column is source_type)
DROP INDEX IF EXISTS public.idx_cash_ledger_source;

-- 2.3 customers.type — only filtered in JS (Array.filter), not in DB query
DROP INDEX IF EXISTS public.idx_customers_type;

-- 2.4 utility_bills.bill_date — table is dead (deny-all RLS, never queried)
DROP INDEX IF EXISTS public.idx_utility_bills_bill_date;

-- 2.5 utility_bills.bill_type — same as above
DROP INDEX IF EXISTS public.idx_utility_bills_bill_type;

-- 2.6 sales.location_id — only SELECTed, never filtered
DROP INDEX IF EXISTS public.idx_sales_location_id;

-- 2.7 employee_salaries.payment_date — table never queried by app code
DROP INDEX IF EXISTS public.idx_employee_salaries_payment_date;

-- 2.8 purchases.supplier_id — only SELECTed, never filtered
DROP INDEX IF EXISTS public.idx_purchases_supplier_id;

-- 2.9 purchases.location_id — only SELECTed, never filtered
DROP INDEX IF EXISTS public.idx_purchases_location_id;


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════════

-- 3.1 Verify all 5 FK indexes now exist
SELECT
  tablename AS table_name,
  indexname AS index_name,
  indexdef AS definition
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_app_customers_linked_customer_id',
    'idx_cash_transfers_from_account_id',
    'idx_cash_transfers_to_account_id',
    'idx_employee_salaries_employee_id',
    'idx_mix_orders_customer_id'
  )
ORDER BY tablename, indexname;
-- Expected: 5 rows


-- 3.2 Verify the 9 unused indexes are gone
SELECT
  tablename AS table_name,
  indexname AS index_name
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_cash_ledger_direction',
    'idx_cash_ledger_source',
    'idx_customers_type',
    'idx_utility_bills_bill_date',
    'idx_utility_bills_bill_type',
    'idx_sales_location_id',
    'idx_employee_salaries_payment_date',
    'idx_purchases_supplier_id',
    'idx_purchases_location_id'
  )
ORDER BY tablename, indexname;
-- Expected: 0 rows


-- 3.3 Sanity check: confirm the 6 KEPT indexes still exist
SELECT
  tablename AS table_name,
  indexname AS index_name
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_app_customers_email',
    'idx_cash_ledger_account_id',
    'idx_customers_is_active',
    'idx_labours_active',
    'idx_labour_payments_type',
    'idx_product_stock_location_id'
  )
ORDER BY tablename, indexname;
-- Expected: 6 rows (these are intentionally kept — they back live queries)


-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if needed)
-- ════════════════════════════════════════════════════════════════════════
-- -- Re-create dropped indexes (only if a query regresses):
-- CREATE INDEX IF NOT EXISTS idx_cash_ledger_direction         ON public.cash_ledger (direction);
-- CREATE INDEX IF NOT EXISTS idx_cash_ledger_source            ON public.cash_ledger (source);
-- CREATE INDEX IF NOT EXISTS idx_customers_type                ON public.customers (type);
-- CREATE INDEX IF NOT EXISTS idx_utility_bills_bill_date       ON public.utility_bills (bill_date);
-- CREATE INDEX IF NOT EXISTS idx_utility_bills_bill_type       ON public.utility_bills (bill_type);
-- CREATE INDEX IF NOT EXISTS idx_sales_location_id             ON public.sales (location_id);
-- CREATE INDEX IF NOT EXISTS idx_employee_salaries_payment_date ON public.employee_salaries (payment_date);
-- CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id         ON public.purchases (supplier_id);
-- CREATE INDEX IF NOT EXISTS idx_purchases_location_id         ON public.purchases (location_id);
--
-- -- Drop added FK indexes (no reason to unless you want to):
-- DROP INDEX IF EXISTS public.idx_app_customers_linked_customer_id;
-- DROP INDEX IF EXISTS public.idx_cash_transfers_from_account_id;
-- DROP INDEX IF EXISTS public.idx_cash_transfers_to_account_id;
-- DROP INDEX IF EXISTS public.idx_employee_salaries_employee_id;
-- DROP INDEX IF EXISTS public.idx_mix_orders_customer_id;
