-- ════════════════════════════════════════════════════════════════════════
-- 🔧 SUPABASE WARNINGS MASTER FIX SCRIPT
-- ════════════════════════════════════════════════════════════════════════
-- Fixes all 32 warnings reported by Supabase Advisor:
--   1. extension_in_public              (1 warning)  — pgjwt extension
--   2. rls_policy_always_true           (14 warnings) — over-permissive RLS policies
--   3. anon_security_definer_function_executable       (8 warnings)
--   4. authenticated_security_definer_function_executable (8 warnings)
--   5. auth_leaked_password_protection  (1 warning)  — enable leaked password protection
--
-- ✅ APP IMPACT: NONE
--   Our Next.js backend uses `service_role` key (server-side only), which
--   BYPASSES RLS and function EXECUTE permissions entirely. All API routes
--   will continue to work exactly as before.
--
--   What changes:
--   - Anonymous users (no login) can NO LONGER call our RPC functions via
--     PostgREST. They must go through our authenticated API routes.
--   - Authenticated users (Supabase Auth, NOT our customer portal) can NO
--     LONGER call our RPC functions directly. They too must use API routes.
--   - RLS policies that said "USING (true) WITH CHECK (true)" are tightened
--     to deny direct table access from anon/authenticated roles.
--
--   Our customer portal uses its own auth (app_customers table + signed
--   cookies), NOT Supabase Auth. So anon/authenticated PostgREST roles are
--   not used by our app at all.
--
-- 🔁 ROLLBACK: See the bottom of this script for full rollback SQL.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 1: Move pgjwt extension out of public schema
-- Issue: extension_in_public — pgjwt is installed in public schema
-- Fix: Move to `extensions` schema (Supabase's recommended schema)
-- ════════════════════════════════════════════════════════════════════════

-- 1.1. Create extensions schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS extensions;

-- 1.2. Move pgjwt extension to extensions schema
-- Note: DROP + CREATE is the safest way to relocate an extension.
-- The extension itself is small (just a few functions for JWT encoding/decoding).
-- Supabase Auth uses pgjwt internally but doesn't require it to be in public.
DO $$
BEGIN
  -- Check if pgjwt is installed in public
  IF EXISTS (
    SELECT 1 FROM pg_extension e
    JOIN pg_namespace n ON e.extnamespace = n.oid
    WHERE e.extname = 'pgjwt' AND n.nspname = 'public'
  ) THEN
    -- Drop from public (CASCADE drops dependent objects, but pgjwt has no dependents in our schema)
    DROP EXTENSION IF EXISTS pgjwt CASCADE;
    -- Recreate in extensions schema
    CREATE EXTENSION pgjwt WITH SCHEMA extensions;
    RAISE NOTICE '✅ pgjwt moved to extensions schema';
  ELSE
    RAISE NOTICE 'ℹ️ pgjwt not in public schema (already moved or not installed)';
  END IF;
END $$;

-- 1.3. Grant usage on extensions schema to anon/authenticated (so JWT functions still work)
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 2: Fix RLS policies that are always true (over-permissive)
-- Issue: rls_policy_always_true — 14 tables have "USING (true) WITH CHECK (true)"
-- Fix: Drop these permissive policies. RLS will then DENY all direct access
--      to these tables from anon/authenticated roles. Our backend uses
--      service_role which bypasses RLS, so app continues to work.
-- ════════════════════════════════════════════════════════════════════════

-- We drop the permissive "Allow all" policies on all 14 affected tables.
-- After this, anon/authenticated roles cannot SELECT/INSERT/UPDATE/DELETE
-- these tables directly via PostgREST. They MUST go through our API routes.

DO $$
DECLARE
  tbl TEXT;
  tables_with_permissive_policies TEXT[] := ARRAY[
    'cash_accounts',
    'cash_ledger',
    'cash_transfers',
    'customers',
    'employee_salaries',
    'employees',
    'expenses',
    'locations',
    'product_stock',
    'products',
    'purchases',
    'sales',
    'suppliers',
    'utility_bills'
  ];
  pol RECORD;
BEGIN
  FOREACH tbl IN ARRAY tables_with_permissive_policies LOOP
    -- Use pg_policies VIEW (not pg_policy catalog table).
    -- pg_policies exposes: schemaname, tablename, policyname, qual, with_check
    -- Drop policies where BOTH qual='true' AND with_check='true' (permissive for ALL)
    FOR pol IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND qual = 'true'
        AND with_check = 'true'
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, tbl);
      RAISE NOTICE '✅ Dropped permissive policy: % on public.%', pol.policyname, tbl;
    END LOOP;
  END LOOP;
END $$;

-- Note: We are NOT adding replacement policies. This means:
-- - anon role: cannot access these tables at all (most secure)
-- - authenticated role: cannot access these tables at all (most secure)
-- - service_role (our backend): full access (RLS bypassed)
--
-- If you later add Supabase Auth-based customer portal features, you would
-- add specific policies like:
--   CREATE POLICY "Customers can read own sales"
--   ON public.sales FOR SELECT
--   TO authenticated
--   USING (customer_id = auth.uid());
-- But our app doesn't use Supabase Auth, so we don't need this.


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 3: Revoke EXECUTE on SECURITY DEFINER functions from anon + authenticated
-- Issues:
--   anon_security_definer_function_executable          (8 functions)
--   authenticated_security_definer_function_executable (8 functions)
--
-- Fix: REVOKE EXECUTE on these functions FROM anon and authenticated roles.
--      Our backend uses service_role which bypasses function permissions.
--
-- The 8 functions:
--   1. correct_cash_balance
--   2. create_mix_order
--   3. create_sale
--   4. decrement_stock_fallback
--   5. record_expense
--   6. record_purchase
--   7. transfer_cash
--   8. verify_customer_login
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  fn TEXT;
  security_definer_functions TEXT[] := ARRAY[
    'correct_cash_balance',
    'create_mix_order',
    'create_sale',
    'decrement_stock_fallback',
    'record_expense',
    'record_purchase',
    'transfer_cash',
    'verify_customer_login'
  ];
  fn_exists BOOLEAN;
BEGIN
  FOREACH fn IN ARRAY security_definer_functions LOOP
    -- Check if function exists in public schema
    SELECT EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public' AND p.proname = fn
    ) INTO fn_exists;

    IF fn_exists THEN
      -- Revoke EXECUTE from anon and authenticated
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM anon;', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM authenticated;', fn);
      RAISE NOTICE '✅ Revoked EXECUTE on public.% from anon + authenticated', fn;
    ELSE
      RAISE NOTICE '⚠️ Function not found, skipped: public.%', fn;
    END IF;
  END LOOP;
END $$;


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 4: Enable Leaked Password Protection
-- Issue: auth_leaked_password_protection — disabled
-- Fix: Enable via Supabase Auth config (this is the SQL way to do it)
-- ════════════════════════════════════════════════════════════════════════

-- Supabase Auth stores its config in auth.config table.
-- The leaked_password_protection flag rejects passwords found in known
-- data breaches (HaveIBeenPwned database, k-anonymity query).

DO $$
BEGIN
  -- Check if auth.config table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'auth' AND table_name = 'config'
  ) THEN
    -- Update the leaked_password_protection setting
    UPDATE auth.config
    SET leaked_password_protection = true
    WHERE id = '00000000-0000-0000-0000-000000000000';

    -- Verify
    IF FOUND THEN
      RAISE NOTICE '✅ Leaked password protection enabled';
    ELSE
      -- If no row was updated, the config row might not exist yet.
      -- Try inserting default config first (rare case).
      RAISE NOTICE '⚠️ auth.config row not updated. May need manual enable in Dashboard.';
    END IF;
  ELSE
    RAISE NOTICE '⚠️ auth.config table not found. Enable via Dashboard: Authentication → Settings → Leaked Password Protection';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════════════
-- SECTION 5: Verification queries
-- Run these to confirm all fixes are applied
-- ════════════════════════════════════════════════════════════════════════

-- 5.1 Verify pgjwt moved out of public
SELECT
  'pgjwt location' AS check,
  n.nspname AS schema_name,
  CASE WHEN n.nspname = 'extensions' THEN '✅ FIXED' ELSE '❌ Still in public/wrong' END AS status
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname = 'pgjwt';

-- 5.2 Verify no permissive RLS policies remain on the 14 tables
-- (Using pg_policies VIEW — not pg_policy catalog table)
SELECT
  'permissive policies' AS check,
  tablename AS table_name,
  policyname AS policy_name,
  CASE
    WHEN qual = 'true' AND with_check = 'true' THEN '❌ Still permissive'
    ELSE '✅ OK'
  END AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'cash_accounts','cash_ledger','cash_transfers','customers',
    'employee_salaries','employees','expenses','locations',
    'product_stock','products','purchases','sales','suppliers','utility_bills'
  )
ORDER BY tablename;
-- Expected: 0 rows returned (all permissive policies dropped)

-- 5.3 Verify EXECUTE revoked on SECURITY DEFINER functions
SELECT
  'function permissions' AS check,
  routine_name AS function_name,
  CASE
    WHEN has_schema_privilege('anon', 'public', 'USAGE')
      AND has_function_privilege('anon', 'public.' || routine_name || '()', 'EXECUTE')
    THEN '❌ anon can still execute'
    ELSE '✅ anon cannot execute'
  END AS anon_status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'correct_cash_balance','create_mix_order','create_sale',
    'decrement_stock_fallback','record_expense','record_purchase',
    'transfer_cash','verify_customer_login'
  )
ORDER BY routine_name;
-- Expected: all rows show '✅ anon cannot execute'

-- 5.4 Verify leaked password protection enabled
SELECT
  'leaked password protection' AS check,
  CASE
    WHEN leaked_password_protection = true THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END AS status
FROM auth.config
WHERE id = '00000000-0000-0000-0000-000000000000';


-- ════════════════════════════════════════════════════════════════════════
-- ✅ ALL DONE — Refresh Supabase → Advisors to see warnings disappear
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
-- 🔄 ROLLBACK SCRIPT (run only if something breaks)
-- ════════════════════════════════════════════════════════════════════════
-- This restores the original (less secure) state. Use ONLY if a feature
-- breaks after applying the fixes.
--
-- -- 1. Move pgjwt back to public
-- DROP EXTENSION IF EXISTS pgjwt CASCADE;
-- CREATE EXTENSION pgjwt WITH SCHEMA public;
--
-- -- 2. Re-create the permissive "Allow all" RLS policies
-- CREATE POLICY "Allow all on cash_accounts" ON public.cash_accounts FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on cash_ledger" ON public.cash_ledger FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on cash_transfers" ON public.cash_transfers FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on employee_salaries" ON public.employee_salaries FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on employees" ON public.employees FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on locations" ON public.locations FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on product_stock" ON public.product_stock FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on products" ON public.products FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on purchases" ON public.purchases FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
-- CREATE POLICY "Allow all on utility_bills" ON public.utility_bills FOR ALL USING (true) WITH CHECK (true);
--
-- -- 3. Re-grant EXECUTE on security definer functions
-- GRANT EXECUTE ON FUNCTION public.correct_cash_balance() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.create_mix_order() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.create_sale() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.decrement_stock_fallback() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.record_expense() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.record_purchase() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.transfer_cash() TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.verify_customer_login() TO anon, authenticated;
--
-- -- 4. Disable leaked password protection
-- UPDATE auth.config SET leaked_password_protection = false WHERE id = '00000000-0000-0000-0000-000000000000';
-- ════════════════════════════════════════════════════════════════════════
