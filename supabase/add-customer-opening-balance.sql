-- ============================================================
-- Migration: Add opening_balance to customers table
--
-- WHAT THIS DOES:
--   Adds `opening_balance numeric(14,2) NOT NULL DEFAULT 0`
--   to the customers table.
--
-- WHY:
--   When a customer already has a previous outstanding balance
--   (from before the system was in use, or known to the shopkeeper
--   verbally), the user can enter it as a one-time opening balance
--   instead of re-entering all the old sales. The opening balance
--   is then added to the customer's total bill on every bill/statement
--   so the final "Balance Due" reflects:
--       opening_balance + total_sales - cash_paid - goods_settlements
--
-- HOW TO RUN:
--   Run each statement ONE AT A TIME in Supabase SQL Editor.
--   Safe to re-run (uses IF NOT EXISTS).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Add the opening_balance column (safe to re-run)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS opening_balance numeric(14,2) NOT NULL DEFAULT 0;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Reload PostgREST schema cache so Supabase's auto-API
--         exposes the new column immediately.
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────────────────────
-- STEP 3 (optional): verify the column exists
-- ──────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'customers' AND column_name = 'opening_balance';

-- ============================================================
-- DONE.
-- ============================================================
