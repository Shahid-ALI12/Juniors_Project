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
-- SAFE TO RE-RUN. Run in Supabase SQL Editor.
-- ============================================================

-- 1. Add deleted_at column
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Drop the products_name_key constraint if it exists.
--    Use ALTER TABLE ... DROP CONSTRAINT IF EXISTS — this is the
--    proper idempotent way to drop a unique constraint. Works whether
--    the original `CREATE UNIQUE INDEX products_name_key` was
--    promoted to a constraint or not.
ALTER TABLE products
  DROP CONSTRAINT IF EXISTS products_name_key;

-- 3. Also drop the underlying index if it still lingers (in case the
--    object was created as a plain UNIQUE INDEX without a backing
--    constraint). Wrap in DO $$ so the script doesn't fail if the
--    index is already gone.
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
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Index products_name_key already gone or could not be dropped: %', SQLERRM;
END $$;

-- 4. Recreate as a partial unique index — only enforces uniqueness
--    for non-deleted rows. Deleted (tombstoned) products are
--    excluded, so the same name can be reused for a fresh product
--    in the future if desired.
CREATE UNIQUE INDEX IF NOT EXISTS products_name_key
  ON products (lower(name))
  WHERE deleted_at IS NULL;

-- 5. Reload PostgREST schema cache so the new column is visible
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DONE. No application downtime required.
-- ============================================================
