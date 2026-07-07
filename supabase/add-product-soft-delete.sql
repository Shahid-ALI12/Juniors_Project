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
--   2. Drops the `products_name_key` unique index on lower(name)
--      and replaces it with a partial unique index that only
--      applies to NON-deleted rows. This lets the same name be
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
-- SAFE TO RE-RUN (uses IF NOT EXISTS / IF EXISTS).
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================

-- 1. Add deleted_at column
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Replace unique-name index with a partial one that ignores tombstoned rows
DROP INDEX IF EXISTS products_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS products_name_key
  ON products (lower(name))
  WHERE deleted_at IS NULL;

-- 3. Reload PostgREST schema cache so the new column is visible
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DONE. No application downtime required.
-- ============================================================
