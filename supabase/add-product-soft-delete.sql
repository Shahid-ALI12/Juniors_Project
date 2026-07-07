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
--   2. Drops the `products_name_key` UNIQUE CONSTRAINT (not just
--      the index) and replaces it with a partial unique index that
--      only applies to NON-deleted rows. This lets the same name be
--      reused in the future if needed while preventing duplicate
--      active products.
--
-- WHY:
--   - User wants to "permanently delete" products from the UI
--     (so they no longer show in dropdowns or Manage Products),
--     but historical sale/purchase records must keep displaying
--     the original product name.
--   - Hard-deleting a product would violate the ON DELETE RESTRICT
--     FK from sales + purchases (or lose the historical link if
--     we cascade). Tombstone pattern (deleted_at) is the cleanest
--     solution.
--
-- NOTE on products_name_key:
--   In the original schema.sql this was created with
--     `create unique index if not exists products_name_key on products (lower(name))`
--   Postgres automatically promotes a unique INDEX into a unique
--   CONSTRAINT when it backs a UNIQUE column rule, so we must drop
--   it as a CONSTRAINT (DROP CONSTRAINT) rather than as an index
--   (DROP INDEX) — otherwise Postgres raises:
--     "cannot drop index products_name_key because constraint
--      products_name_key on table products requires it"
--   We use DO $$ blocks so the script is idempotent and safe to
--   re-run on databases where the constraint may or may not exist.
--
-- SAFE TO RE-RUN.
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================

-- 1. Add deleted_at column
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2a. Drop the products_name_key CONSTRAINT if it exists.
--     (Some databases may only have the index, others have the
--     constraint — we try both, ignore errors if either is missing.)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'products_name_key'
      AND conrelid = 'products'::regclass
  ) THEN
    ALTER TABLE products DROP CONSTRAINT products_name_key;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not drop constraint products_name_key: %', SQLERRM;
END $$;

-- 2b. Drop the products_name_key INDEX if it still exists (in case
--     it was created as a plain index without a backing constraint).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'products_name_key'
      AND c.relkind = 'i'
      AND n.nspname = current_schema()
  ) THEN
    EXECUTE 'DROP INDEX ' || quote_ident(current_schema()) || '.products_name_key';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not drop index products_name_key: %', SQLERRM;
END $$;

-- 2c. Recreate as a partial unique index — only enforces uniqueness
--     for non-deleted rows. Deleted (tombstoned) products are
--     excluded, so the same name can be reused for a fresh product
--     in the future if desired.
CREATE UNIQUE INDEX IF NOT EXISTS products_name_key
  ON products (lower(name))
  WHERE deleted_at IS NULL;

-- 3. Reload PostgREST schema cache so the new column is visible
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DONE. No application downtime required.
-- ============================================================
