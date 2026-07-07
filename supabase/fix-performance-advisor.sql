-- ════════════════════════════════════════════════════════════════════════
-- FIX: Supabase Performance Advisor Warnings (81 total)
-- ════════════════════════════════════════════════════════════════════════
-- Categories:
--   1. multiple_permissive_policies  (65) — drop redundant anon_read_* policies
--   2. auth_rls_initplan             (14) — wrap auth.role() in (select ...)
--   3. duplicate_index               ( 2) — drop idx_*_<col>_date duplicates
--
-- Safety:
--   App uses service_role client (src/lib/supabase/server-admin.ts) which
--   bypasses RLS entirely. All policy changes are NON-BREAKING for the app
--   because service_role ignores policies. These changes only affect what
--   anon/authenticated roles (the public Supabase API surface) can do.
--
-- Run order:
--   PHASE 0 — Diagnostic: print live policies so we can verify before changing
--   PHASE 1 — Drop duplicate indexes (2 warnings)
--   PHASE 2 — Drop redundant anon_read_* policies on 12 tables (60 warnings)
--   PHASE 3 — Recreate admin_all_* policies with optimized (select auth.role())
--             wrapper (12 warnings from auth_rls_initplan)
--   PHASE 4 — Recreate app_customers policies with optimized wrapper (2 warnings)
--   PHASE 5 — Verification
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 0: DIAGNOSTIC — print current policy state (read-only, no changes)
-- Run this FIRST to confirm what's currently on the live DB.
-- ────────────────────────────────────────────────────────────────────────
SELECT
  tablename AS table_name,
  policyname AS policy_name,
  cmd AS for_action,
  roles AS applies_to,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'admin_users','app_customers','cash_accounts','cash_ledger','cash_transfers',
    'customers','expenses','locations','product_stock','products',
    'purchases','sales','suppliers'
  )
ORDER BY tablename, policyname;
-- Save this output for rollback purposes (in case admin_all_* definitions differ).


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 1: DROP DUPLICATE INDEXES (fixes 2 duplicate_index warnings)
-- ────────────────────────────────────────────────────────────────────────
-- The repo has the canonical names:
--   idx_expenses_date   ON expenses (expense_date)       — schema.sql:194
--   idx_purchases_date  ON purchases (purchase_date)     — schema.sql:195
--
-- These duplicates were created ad-hoc on the live DB and index the SAME
-- columns. Drop the duplicates (keep the repo-tracked canonical names).

-- Verify duplicates exist before dropping
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_expenses_date','idx_expenses_expense_date',
                    'idx_purchases_date','idx_purchases_purchase_date')
ORDER BY tablename, indexname;

-- Drop duplicates (keep canonical names)
DROP INDEX IF EXISTS public.idx_expenses_expense_date;
DROP INDEX IF EXISTS public.idx_purchases_purchase_date;


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 2: DROP REDUNDANT anon_read_* POLICIES (fixes 60 of 65
--          multiple_permissive_policies warnings)
-- ────────────────────────────────────────────────────────────────────────
-- Each of these 12 tables has 2 permissive SELECT policies:
--   1. admin_all_<table>  — keep this (it's FOR ALL, the main policy)
--   2. anon_read_<table>  — drop this (legacy, redundant)
--
-- After dropping, only ONE permissive policy will remain per table →
-- advisor satisfied. service_role still bypasses RLS → app unaffected.

DROP POLICY IF EXISTS anon_read_admin_users      ON public.admin_users;
DROP POLICY IF EXISTS anon_read_cash_accounts    ON public.cash_accounts;
DROP POLICY IF EXISTS anon_read_cash_ledger      ON public.cash_ledger;
DROP POLICY IF EXISTS anon_read_cash_transfers   ON public.cash_transfers;
DROP POLICY IF EXISTS anon_read_customers        ON public.customers;
DROP POLICY IF EXISTS anon_read_expenses         ON public.expenses;
DROP POLICY IF EXISTS anon_read_locations        ON public.locations;
DROP POLICY IF EXISTS anon_read_product_stock    ON public.product_stock;
DROP POLICY IF EXISTS anon_read_products         ON public.products;
DROP POLICY IF EXISTS anon_read_purchases        ON public.purchases;
DROP POLICY IF EXISTS anon_read_sales            ON public.sales;
DROP POLICY IF EXISTS anon_read_suppliers        ON public.suppliers;


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 3: RECREATE admin_all_* POLICIES WITH OPTIMIZED auth.role() WRAPPER
--          (fixes 12 of 14 auth_rls_initplan warnings)
-- ────────────────────────────────────────────────────────────────────────
-- Issue: policies call `auth.role()` which gets re-evaluated per-row.
-- Fix:   wrap in `(select auth.role())` to force a single init-plan
--        evaluation per query. This is the Supabase-recommended fix.
-- Ref:   https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- We DROP and CREATE each policy so the new optimized version replaces it.
-- All policies are FOR ALL with the same USING/WITH CHECK semantics.
-- If the live admin_all_* policy used a different USING clause, that
-- clause will be lost — PHASE 0 diagnostic output should be reviewed
-- before running this section.

-- 3.1 admin_users
DROP POLICY IF EXISTS admin_all_admin_users ON public.admin_users;
CREATE POLICY admin_all_admin_users ON public.admin_users
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.2 cash_accounts
DROP POLICY IF EXISTS admin_all_cash_accounts ON public.cash_accounts;
CREATE POLICY admin_all_cash_accounts ON public.cash_accounts
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.3 cash_ledger
DROP POLICY IF EXISTS admin_all_cash_ledger ON public.cash_ledger;
CREATE POLICY admin_all_cash_ledger ON public.cash_ledger
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.4 cash_transfers
DROP POLICY IF EXISTS admin_all_cash_transfers ON public.cash_transfers;
CREATE POLICY admin_all_cash_transfers ON public.cash_transfers
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.5 customers
DROP POLICY IF EXISTS admin_all_customers ON public.customers;
CREATE POLICY admin_all_customers ON public.customers
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.6 expenses
DROP POLICY IF EXISTS admin_all_expenses ON public.expenses;
CREATE POLICY admin_all_expenses ON public.expenses
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.7 locations
DROP POLICY IF EXISTS admin_all_locations ON public.locations;
CREATE POLICY admin_all_locations ON public.locations
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.8 product_stock
DROP POLICY IF EXISTS admin_all_product_stock ON public.product_stock;
CREATE POLICY admin_all_product_stock ON public.product_stock
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.9 products
DROP POLICY IF EXISTS admin_all_products ON public.products;
CREATE POLICY admin_all_products ON public.products
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.10 purchases
DROP POLICY IF EXISTS admin_all_purchases ON public.purchases;
CREATE POLICY admin_all_purchases ON public.purchases
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.11 sales
DROP POLICY IF EXISTS admin_all_sales ON public.sales;
CREATE POLICY admin_all_sales ON public.sales
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');

-- 3.12 suppliers
DROP POLICY IF EXISTS admin_all_suppliers ON public.suppliers;
CREATE POLICY admin_all_suppliers ON public.suppliers
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 4: RECREATE app_customers POLICIES WITH OPTIMIZED auth.role() WRAPPER
--          (fixes remaining 2 of 14 auth_rls_initplan warnings)
-- ────────────────────────────────────────────────────────────────────────
-- Note: app_customers uses SPACE-CONTAINING policy names (must be double-quoted).
-- The repo (schema.sql:208-210) has these canonical definitions:
--   "app_customers admin read"  FOR SELECT USING (auth.role() = 'authenticated')
--   "app_customers admin write" FOR ALL      USING (auth.role() = 'authenticated')
--                                                   WITH CHECK (auth.role() = 'authenticated')
-- We optimize by wrapping auth.role() in (select ...).

DROP POLICY IF EXISTS "app_customers admin read" ON public.app_customers;
CREATE POLICY "app_customers admin read" ON public.app_customers
  FOR SELECT
  USING ((select auth.role()) = 'authenticated');

DROP POLICY IF EXISTS "app_customers admin write" ON public.app_customers;
CREATE POLICY "app_customers admin write" ON public.app_customers
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');


-- ════════════════════════════════════════════════════════════════════════
-- PHASE 5: VERIFICATION
-- Run this block to confirm all 81 warnings are now resolved.
-- ════════════════════════════════════════════════════════════════════════

-- 5.1 Verify no duplicate indexes remain
SELECT
  'duplicate_index_check' AS check,
  tablename AS table_name,
  indexname AS index_name
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN ('idx_expenses_expense_date','idx_purchases_purchase_date')
ORDER BY tablename;
-- Expected: 0 rows

-- 5.2 Verify only ONE policy per table (no more multiple_permissive_policies)
SELECT
  'multiple_permissive_check' AS check,
  tablename AS table_name,
  COUNT(*) AS policy_count,
  STRING_AGG(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'admin_users','app_customers','cash_accounts','cash_ledger','cash_transfers',
    'customers','expenses','locations','product_stock','products',
    'purchases','sales','suppliers'
  )
GROUP BY tablename
ORDER BY tablename;
-- Expected: every table shows policy_count = 1
-- (admin_users=1, app_customers=2 (intentional: read+write split),
--  cash_accounts=1, cash_ledger=1, cash_transfers=1, customers=1,
--  expenses=1, locations=1, product_stock=1, products=1,
--  purchases=1, sales=1, suppliers=1)

-- 5.3 Verify auth.role() is now wrapped in (select ...)
SELECT
  'auth_rls_initplan_check' AS check,
  tablename AS table_name,
  policyname AS policy_name,
  CASE
    WHEN qual LIKE '%(select auth.role())%' THEN '✅ optimized (using)'
    ELSE '❌ NOT optimized (using): ' || qual
  END AS using_status,
  CASE
    WHEN with_check IS NULL THEN '— (no with check)'
    WHEN with_check LIKE '%(select auth.role())%' THEN '✅ optimized (with_check)'
    ELSE '❌ NOT optimized (with_check): ' || with_check
  END AS with_check_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'admin_users','app_customers','cash_accounts','cash_ledger','cash_transfers',
    'customers','expenses','locations','product_stock','products',
    'purchases','sales','suppliers'
  )
ORDER BY tablename, policyname;
-- Expected: every row shows ✅ optimized (or — for SELECT-only policies)


-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if something breaks)
-- ════════════════════════════════════════════════════════════════════════
-- If you need to restore the old (non-optimized) policies, drop the new
-- ones and recreate with the original `auth.role() = 'authenticated'`
-- (without the (select ...) wrapper). The non-optimized versions are
-- functionally identical — they just have a performance warning.
--
-- -- Restore duplicate indexes (only if you really need them):
-- CREATE INDEX IF NOT EXISTS idx_expenses_expense_date   ON public.expenses (expense_date);
-- CREATE INDEX IF NOT EXISTS idx_purchases_purchase_date ON public.purchases (purchase_date);
--
-- -- Restore old non-optimized policies:
-- DROP POLICY IF EXISTS admin_all_admin_users ON public.admin_users;
-- CREATE POLICY admin_all_admin_users ON public.admin_users
--   FOR ALL USING (auth.role() = 'authenticated')
--   WITH CHECK (auth.role() = 'authenticated');
-- -- (repeat for other tables)
