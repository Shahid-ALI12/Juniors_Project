-- ============================================================
-- Migration: Add soft-delete (deleted_at) to customers table
--
-- WHAT THIS DOES:
--   Adds `deleted_at timestamptz` column to customers table.
--   Allows "permanent" UI deletion while preserving historical
--   sales/purchases/mix_orders records (FK on delete restrict).
--
-- WHY:
--   The sales.customer_id FK is `on delete restrict`, so a
--   customer with any sales cannot be hard-deleted. Previously
--   the API just attempted hard-delete and failed. With this
--   tombstone pattern:
--     - Soft delete (is_active=false) → customer hidden from
--       sale/purchase dropdowns but still visible on Manage page.
--     - Permanent delete (deleted_at=now()) → customer hidden
--       from ALL UI surfaces, but DB row stays so historical
--       receipts keep showing the customer name.
--     - Restore only works for soft-deleted; tombstoned rows
--       cannot be restored (by design).
--
-- HOW TO RUN:
--   Paste this whole file into Supabase SQL Editor and click Run.
--   Safe to re-run (uses IF NOT EXISTS / IF EXISTS).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Add the deleted_at column (safe to re-run)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Drop the existing customers_name_key unique constraint
--         (if it exists) and recreate as a PARTIAL unique index
--         that only applies to non-tombstoned rows.
--         This allows reusing a tombstoned customer's name in
--         future without FK conflicts.
-- ──────────────────────────────────────────────────────────────
-- First check if there is a UNIQUE CONSTRAINT (older schemas)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'customers'
      AND constraint_name = 'customers_name_key'
      AND constraint_type = 'UNIQUE'
  ) THEN
    ALTER TABLE customers DROP CONSTRAINT customers_name_key;
  END IF;
END$$;

-- Drop any existing index with the same name (older schemas)
DROP INDEX IF EXISTS customers_name_key;

-- Create partial unique index — only enforces uniqueness for
-- non-tombstoned customers (deleted_at IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS customers_name_active_key
  ON customers (lower(name))
  WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Reload PostgREST schema cache so Supabase's auto-API
--         exposes the new column + index immediately.
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ──────────────────────────────────────────────────────────────
-- STEP 4 (optional): verify the column + index exist
-- ──────────────────────────────────────────────────────────────
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'customers' AND column_name = 'deleted_at';
--
-- SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'customers';

-- ============================================================
-- DONE.
-- ============================================================
