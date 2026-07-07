-- ════════════════════════════════════════════════════════════════════════
-- FIX: RLS Enabled No Policy (6 INFO warnings)
-- ════════════════════════════════════════════════════════════════════════
-- Fixes 6 Supabase Advisor INFO warnings:
--   rls_enabled_no_policy on:
--     1. public.employee_salaries
--     2. public.employees
--     3. public.labour_payments
--     4. public.labours
--     5. public.mix_orders
--     6. public.utility_bills
--
-- Why these warnings appeared:
--   These tables have RLS enabled but no policies. RLS with no policy
--   means DEFAULT DENY for anon/authenticated roles (which is what we
--   want). The Supabase Advisor just wants to see an explicit policy.
--
-- Fix strategy:
--   Add an explicit DENY-ALL policy (USING false, WITH CHECK false) on
--   each table. This:
--     - Functionally identical to current state (anon/authenticated blocked)
--     - service_role still bypasses RLS = full access (no change to app)
--     - Clears the INFO warnings
--     - Makes intent explicit in the schema
--
-- Safety:
--   - App uses service_role client exclusively (src/lib/supabase/server-admin.ts)
--   - service_role bypasses RLS = this policy does NOT affect the app
--   - Deny-all is the most secure policy possible
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 1. employee_salaries
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS deny_all_access ON public.employee_salaries;
CREATE POLICY deny_all_access ON public.employee_salaries
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────────────────
-- 2. employees
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS deny_all_access ON public.employees;
CREATE POLICY deny_all_access ON public.employees
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────────────────
-- 3. labour_payments
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS deny_all_access ON public.labour_payments;
CREATE POLICY deny_all_access ON public.labour_payments
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────────────────
-- 4. labours
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS deny_all_access ON public.labours;
CREATE POLICY deny_all_access ON public.labours
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────────────────
-- 5. mix_orders
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS deny_all_access ON public.mix_orders;
CREATE POLICY deny_all_access ON public.mix_orders
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ────────────────────────────────────────────────────────────────────────
-- 6. utility_bills
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS deny_all_access ON public.utility_bills;
CREATE POLICY deny_all_access ON public.utility_bills
  FOR ALL
  USING (false)
  WITH CHECK (false);


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- Expected: 6 rows, each showing '✅ Has explicit policy'
-- ════════════════════════════════════════════════════════════════════════
SELECT
  tablename AS table_name,
  policyname AS policy_name,
  CASE
    WHEN qual = 'false' AND with_check = 'false' THEN '✅ Deny-all policy in place'
    ELSE '❌ Unexpected policy: ' || COALESCE(qual, 'NULL') || ' / ' || COALESCE(with_check, 'NULL')
  END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'employee_salaries',
    'employees',
    'labour_payments',
    'labours',
    'mix_orders',
    'utility_bills'
  )
ORDER BY tablename;
-- Expected: 6 rows, all '✅ Deny-all policy in place'


-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if needed)
-- ════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS deny_all_access ON public.employee_salaries;
-- DROP POLICY IF EXISTS deny_all_access ON public.employees;
-- DROP POLICY IF EXISTS deny_all_access ON public.labour_payments;
-- DROP POLICY IF EXISTS deny_all_access ON public.labours;
-- DROP POLICY IF EXISTS deny_all_access ON public.mix_orders;
-- DROP POLICY IF EXISTS deny_all_access ON public.utility_bills;
