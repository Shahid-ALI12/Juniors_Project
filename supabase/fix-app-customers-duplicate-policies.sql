-- ════════════════════════════════════════════════════════════════════════
-- FIX: app_customers — Multiple Permissive Policies (5 WARN warnings)
-- ════════════════════════════════════════════════════════════════════════
-- Issue:
--   app_customers has 2 policies that BOTH match the SELECT action:
--     1. "app_customers admin read"  — FOR SELECT USING (auth.role() = 'authenticated')
--     2. "app_customers admin write" — FOR ALL      USING (auth.role() = 'authenticated')
--                                                  WITH CHECK (auth.role() = 'authenticated')
--   Since FOR ALL includes SELECT, both policies apply to SELECT →
--   Supabase Performance Advisor flags this as multiple_permissive_policies
--   for 5 roles (anon, authenticated, authenticator, dashboard_user,
--   supabase_privileged_role).
--
-- Fix:
--   Drop the redundant "admin read" policy. Keep the "admin write" policy
--   (FOR ALL) which already covers SELECT via its USING clause.
--   Result: exactly ONE policy per action → advisor satisfied.
--
-- Safety:
--   - App uses service_role client (src/lib/supabase/server-admin.ts)
--     which bypasses RLS entirely. Policy changes do NOT affect the app.
--   - Functionally: authenticated users could already do everything via
--     the FOR ALL policy; the read-only policy was redundant.
--   - Also uses (select auth.role()) wrapper to fix auth_rls_initplan
--     performance warning.
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- STEP 1: Drop redundant read-only policy (this clears 5 warnings)
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "app_customers admin read" ON public.app_customers;


-- ────────────────────────────────────────────────────────────────────────
-- STEP 2: Recreate "admin write" policy with optimized (select auth.role())
--         wrapper to clear any auth_rls_initplan warning on app_customers.
--         (The previous performance-advisor fix script already did this,
--          but we redo it here to be safe in case the script was run
--          out of order.)
-- ────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "app_customers admin write" ON public.app_customers;
CREATE POLICY "app_customers admin write" ON public.app_customers
  FOR ALL
  USING ((select auth.role()) = 'authenticated')
  WITH CHECK ((select auth.role()) = 'authenticated');


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════════

-- 1. Confirm only ONE policy now exists on app_customers
SELECT
  tablename AS table_name,
  policyname AS policy_name,
  cmd AS for_action,
  qual AS using_clause,
  with_check AS with_check_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'app_customers'
ORDER BY policyname;
-- Expected: exactly 1 row:
--   policy_name = "app_customers admin write"
--   for_action  = ALL
--   using_clause        = ((select auth.role()) = 'authenticated')
--   with_check_clause   = ((select auth.role()) = 'authenticated')


-- 2. Confirm no other tables still have multiple permissive policies
--    (sanity check across all public tables)
SELECT
  tablename AS table_name,
  cmd AS for_action,
  COUNT(*) AS policy_count,
  STRING_AGG(policyname, ', ' ORDER BY policyname) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
HAVING COUNT(*) > 1
ORDER BY tablename, cmd;
-- Expected: 0 rows (no table has multiple policies for the same action)


-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if needed)
-- ════════════════════════════════════════════════════════════════════════
-- DROP POLICY IF EXISTS "app_customers admin write" ON public.app_customers;
-- CREATE POLICY "app_customers admin read"  ON public.app_customers
--   FOR SELECT USING (auth.role() = 'authenticated');
-- CREATE POLICY "app_customers admin write" ON public.app_customers
--   FOR ALL USING (auth.role() = 'authenticated')
--   WITH CHECK (auth.role() = 'authenticated');
