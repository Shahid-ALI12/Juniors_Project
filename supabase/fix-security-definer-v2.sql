-- ════════════════════════════════════════════════════════════════════════
-- FIX: SECURITY DEFINER Function Executable by anon + authenticated
-- ════════════════════════════════════════════════════════════════════════
-- Fixes 16 Supabase Advisor warnings:
--   - 8 × anon_security_definer_function_executable
--   - 8 × authenticated_security_definer_function_executable
--
-- Root cause of previous failure:
--   PostgreSQL grants EXECUTE on new functions to PUBLIC by default.
--   anon + authenticated are members of PUBLIC, so they inherit EXECUTE.
--   Revoking only from anon/authenticated is NOT enough — must also revoke
--   from PUBLIC.
--
-- Safety:
--   All 8 functions are called from Next.js server code via the
--   service_role client (src/lib/supabase/server-admin.ts), which bypasses
--   RLS and EXECUTE permissions. Revoking anon/authenticated/PUBLIC will
--   NOT break the app.
--
--   verify_customer_login SQL function is actually dead code — the app
--   verifies passwords in Node.js using bcrypt. Revoking it is 100% safe.
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 1. correct_cash_balance
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.correct_cash_balance(
  p_account_id bigint,
  p_target numeric,
  p_date date,
  p_entered_by text
) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 2. create_mix_order
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_mix_order(
  p_customer_id bigint,
  p_order_date date,
  p_target_weight_kg numeric,
  p_cash_received numeric,
  p_entered_by text,
  p_items jsonb,
  p_driver_name text,
  p_driver_rent numeric,
  p_location_id bigint
) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 3. create_sale
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.create_sale(
  p_items jsonb,
  p_customer_id bigint,
  p_sale_date date,
  p_cash_received numeric,
  p_rickshaw_fare numeric,
  p_rickshaw_driver text,
  p_transaction_group_id text,
  p_entered_by text,
  p_location_id bigint
) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 4. decrement_stock_fallback
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.decrement_stock_fallback(
  p_product_id bigint,
  p_location_id bigint,
  p_quantity numeric
) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 5. record_expense
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.record_expense(
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_entered_by text
) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 6. record_purchase
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.record_purchase(
  p_purchase_date date,
  p_product_id bigint,
  p_quantity numeric,
  p_rate_per_bag numeric,
  p_supplier_id bigint,
  p_settled_by_customer_id bigint,
  p_cash_paid numeric,
  p_notes text,
  p_unit_type text,
  p_bag_weight_kg numeric,
  p_entered_by text,
  p_location_id bigint
) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 7. transfer_cash
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.transfer_cash(
  p_from_account_id bigint,
  p_to_account_id bigint,
  p_amount numeric,
  p_date date,
  p_notes text,
  p_entered_by text
) FROM PUBLIC, anon, authenticated;


-- ────────────────────────────────────────────────────────────────────────
-- 8. verify_customer_login
-- (SQL function is dead code — app verifies via bcrypt in Node.js.
--  Revoking EXECUTE is 100% safe and will not break customer login.)
-- ────────────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.verify_customer_login(
  p_email text,
  p_password text
) FROM PUBLIC, anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- Run this block separately to confirm all 16 warnings are now resolved.
-- Expected: every row shows ❌ for both anon and authenticated.
-- ════════════════════════════════════════════════════════════════════════
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  CASE
    WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
    THEN '❌ anon can STILL execute (warning will persist)'
    ELSE '✅ anon cannot execute'
  END AS anon_status,
  CASE
    WHEN has_function_privilege('authenticated', p.oid, 'EXECUTE')
    THEN '❌ authenticated can STILL execute (warning will persist)'
    ELSE '✅ authenticated cannot execute'
  END AS auth_status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'correct_cash_balance',
    'create_mix_order',
    'create_sale',
    'decrement_stock_fallback',
    'record_expense',
    'record_purchase',
    'transfer_cash',
    'verify_customer_login'
  )
ORDER BY p.proname;
-- Expected: 8 rows, all showing '✅ anon cannot execute' AND '✅ authenticated cannot execute'


-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if something breaks — should not be needed)
-- ════════════════════════════════════════════════════════════════════════
-- GRANT EXECUTE ON FUNCTION public.correct_cash_balance(bigint, numeric, date, text) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.create_mix_order(bigint, date, numeric, numeric, text, jsonb, text, numeric, bigint) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.create_sale(jsonb, bigint, date, numeric, numeric, text, text, text, bigint) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.decrement_stock_fallback(bigint, bigint, numeric) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.record_expense(text, numeric, date, text) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.record_purchase(date, bigint, numeric, numeric, bigint, bigint, numeric, text, text, numeric, text, bigint) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.transfer_cash(bigint, bigint, numeric, date, text, text) TO anon, authenticated;
-- GRANT EXECUTE ON FUNCTION public.verify_customer_login(text, text) TO anon, authenticated;
