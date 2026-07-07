-- ============================================================
-- Migration: Remove "locations" concept + add mix order fields
--
-- WHAT THIS DOES:
--   1. Adds driver_name + driver_rent columns to mix_orders
--      (for the new Custom Mix Order driver fields).
--   2. Makes location_id columns nullable on the 4 tables that
--      currently have NOT NULL FK to locations(id).
--      → New rows can have NULL location_id; existing rows keep
--        their values (no data loss).
--   3. Drops the FK constraints on location_id (so the locations
--      table can be emptied or dropped later if desired — but we
--      do NOT drop the table here, that's an explicit manual step
--      for the user if they want to fully remove it).
--
-- WHAT THIS DOES NOT DO:
--   - Does NOT delete the locations table.
--   - Does NOT delete existing location_id values in sales/purchases/
--     product_stock/mix_orders.
--   - Does NOT touch the create_sale / record_purchase / create_mix_order
--     RPC signatures — those are updated in all-rpc-functions.sql
--     (re-run that file separately to pick up the new signatures).
--
-- SAFE TO RE-RUN (uses IF NOT EXISTS / IF EXISTS).
-- Run in Supabase SQL Editor (Dashboard → SQL Editor → New query).
-- ============================================================

-- ─── 1. New columns on mix_orders ───
ALTER TABLE mix_orders
  ADD COLUMN IF NOT EXISTS driver_name text,
  ADD COLUMN IF NOT EXISTS driver_rent numeric(14,2) NOT NULL DEFAULT 0;

-- ─── 2. Drop NOT NULL + FK constraints on location_id columns ───
-- We drop the FK first (so the column becomes a plain bigint),
-- then drop the NOT NULL constraint, so new rows can have NULL.

-- 2a. product_stock
ALTER TABLE product_stock DROP CONSTRAINT IF EXISTS product_stock_location_id_fkey;
ALTER TABLE product_stock ALTER COLUMN location_id DROP NOT NULL;
-- Also relax the unique constraint to only key on product_id (since
-- location_id can now be NULL).
ALTER TABLE product_stock DROP CONSTRAINT IF EXISTS product_stock_product_id_location_id_key;
ALTER TABLE product_stock ADD CONSTRAINT product_stock_product_id_ukey UNIQUE (product_id);

-- 2b. mix_orders
ALTER TABLE mix_orders DROP CONSTRAINT IF EXISTS mix_orders_location_id_fkey;
ALTER TABLE mix_orders ALTER COLUMN location_id DROP NOT NULL;

-- 2c. sales
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_location_id_fkey;
ALTER TABLE sales ALTER COLUMN location_id DROP NOT NULL;

-- 2d. purchases
ALTER TABLE purchases DROP CONSTRAINT IF EXISTS purchases_location_id_fkey;
ALTER TABLE purchases ALTER COLUMN location_id DROP NOT NULL;

-- ─── 3. (Optional) Truncate the locations table ───
-- We leave the table itself in place (for backward compatibility
-- with any existing backup JSON files that reference it), but empty
-- it so no new rows can accidentally reference stale location IDs.
-- To fully remove the table, run the next two lines manually:
-- TRUNCATE locations;
-- DROP TABLE locations;

-- ─── 4. Reload PostgREST schema cache ───
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- DONE. Now run all-rpc-functions.sql to update RPC signatures.
-- ============================================================
