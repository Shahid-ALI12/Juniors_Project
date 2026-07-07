-- ============================================================
-- Migration: Add soft-delete (deleted_at) to products table
--
-- WHAT THIS DOES:
--   1. Adds `deleted_at timestamptz` column to `products`.
--      • NULL  = product is alive (visible in UI).
--      • set   = product is permanently deleted from the UI but
--                the row stays in the database so historical
--                sales/purchases rows that reference it (via the
--                product_id FK) keep working and the name still
--                shows on old receipts.
--   2. Drops the existing `products_name_key` unique constraint
--      and replaces it with a partial unique index that only
--      applies to NON-deleted rows.
--
-- WHY:
--   - User wants to "permanently delete" products from the UI
--     but historical sale/purchase records must keep displaying
--     the original product name.
--   - Hard-deleting a product would violate the ON DELETE RESTRICT
--     FK from sales + purchases. Tombstone pattern is the cleanest
--     solution.
--
-- HOW TO RUN:
--   Run each statement below ONE AT A TIME in Supabase SQL Editor.
--   Supabase SQL Editor sometimes runs multi-statement scripts in
--   a way that fails dependency checks between statements, so
--   running each statement individually is the most reliable way.
--
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- STEP 1: Add the deleted_at column (safe to re-run)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ──────────────────────────────────────────────────────────────
-- STEP 2: Drop the unique CONSTRAINT named products_name_key.
-- This is the canonical way to drop it. The "IF EXISTS" makes it
-- idempotent — if the constraint is already gone, nothing happens.
--
-- IMPORTANT: do NOT use "DROP INDEX products_name_key" here.
-- Postgres internally links the constraint to its backing index,
-- so dropping the index directly fails with:
--   ERROR 2BP01: cannot drop index products_name_key because
--   constraint products_name_key on table products requires it
-- Dropping the CONSTRAINT automatically removes the backing index.
-- ──────────────────────────────────────────────────────────────
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_name_key;

-- ──────────────────────────────────────────────────────────────
-- STEP 3: Drop any lingering index of the same name (in case it
-- was originally created as a plain UNIQUE INDEX without a backing
-- constraint). Wrapped in DO $$ so it's a no-op if already gone.
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'products_name_key'
      AND c.relkind = 'i'
      AND n.nspname = current_schema()
  ) THEN
    EXECUTE format('DROP INDEX %I.products_name_key', current_schema());
    RAISE NOTICE 'Dropped lingering index products_name_key';
  ELSE
    RAISE NOTICE 'No lingering index products_name_key found';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Index drop skipped: %', SQLERRM;
END $$;

-- ──────────────────────────────────────────────────────────────
-- STEP 4: Create the partial unique index that only enforces
-- uniqueness for non-deleted (deleted_at IS NULL) rows. This
-- lets tombstoned product names be reused in the future.
-- ──────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS products_name_key
  ON products (lower(name))
  WHERE deleted_at IS NULL;

-- ──────────────────────────────────────────────────────────────
-- STEP 5: Reload PostgREST schema cache so the new column shows
-- up immediately in API responses.
-- ──────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DONE. To verify the migration ran successfully, run:
--
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'products' AND column_name = 'deleted_at';
--
-- You should see one row: deleted_at | timestamp with time zone
--
--   SELECT indexname, indexdef
--   FROM pg_indexes
--   WHERE tablename = 'products' AND indexname = 'products_name_key';
--
-- You should see the partial unique index with "WHERE deleted_at IS NULL"
-- ============================================================
