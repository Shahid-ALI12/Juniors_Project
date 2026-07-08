-- ════════════════════════════════════════════════════════════════════════
-- FIX: Repair sales/purchases/mix_orders location_id FK violations
-- ════════════════════════════════════════════════════════════════════════
-- PROBLEM:
--   Running re-add-locations-farmhouse-shop.sql failed at Phase 4.1 with:
--     ERROR: 23503: insert or update on table "sales" violates foreign key
--     constraint "sales_location_id_fkey"
--     DETAIL: Key (location_id)=(5) is not present in table "locations".
--
-- ROOT CAUSE:
--   Phase 1 TRUNCATE'd `locations` and reseeded only ids 1 (Farmhouse) and
--   2 (Shop). But sales/purchases/mix_orders had existing rows with non-NULL
--   invalid location_ids (3, 4, 5, …) — left over from before the previous
--   "remove-locations" migration. Phase 2 only migrated NULL → 1, leaving
--   these invalid values untouched. When Phase 4.1 added the FK, those rows
--   violated it.
--
-- WHAT THIS FIX DOES:
--   1. Reports which tables still have invalid location_ids (for visibility)
--   2. Updates ALL invalid location_ids (NULL OR not in locations) → 1
--      (Farmhouse) in product_stock, sales, purchases, mix_orders
--   3. Verifies no invalid rows remain
--   4. Then you can re-run re-add-locations-farmhouse-shop.sql (idempotent)
--      OR just continue from Phase 4 of that migration manually.
--
-- SAFE TO RUN MULTIPLE TIMES — fully idempotent.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- STEP 1: Diagnostic — count rows with invalid location_id BEFORE fix
-- ────────────────────────────────────────────────────────────────────────
SELECT 'BEFORE FIX' AS stage;
SELECT 'product_stock' AS table_name, COUNT(*) AS invalid_rows
FROM public.product_stock
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'sales', COUNT(*)
FROM public.sales
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'purchases', COUNT(*)
FROM public.purchases
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'mix_orders', COUNT(*)
FROM public.mix_orders
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);


-- ────────────────────────────────────────────────────────────────────────
-- STEP 2: Ensure locations table has at least Farmhouse (id=1)
-- ────────────────────────────────────────────────────────────────────────
-- If Phase 1 of the original migration already ran, locations = {1, 2}.
-- If for some reason locations is empty or missing id=1, restore it.
-- Use OVERRIDING SYSTEM VALUE because locations.id is GENERATED ALWAYS AS IDENTITY
-- (PostgreSQL 12+). Without this clause, inserting an explicit id raises:
--   ERROR 428C9: cannot insert a non-DEFAULT value into column "id"
--   HINT: Use OVERRIDING SYSTEM VALUE to override.
INSERT INTO public.locations (id, name)
VALUES (1, 'Farmhouse'), (2, 'Shop')
OVERRIDING SYSTEM VALUE
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

-- Make sure sequence is ahead of any manually-inserted ids (so future
-- auto-generated inserts don't collide with 1 or 2)
SELECT setval(
  pg_get_serial_sequence('public.locations', 'id'),
  GREATEST((SELECT MAX(id) FROM public.locations), 2),
  true
);

-- Sanity check
SELECT id, name FROM public.locations ORDER BY id;
-- Expected: 1=Farmhouse, 2=Shop


-- ────────────────────────────────────────────────────────────────────────
-- STEP 3: Repair — set invalid location_id → 1 (Farmhouse) in all 4 tables
-- ────────────────────────────────────────────────────────────────────────

-- 3.1 product_stock
UPDATE public.product_stock
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);

-- 3.2 sales
UPDATE public.sales
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);

-- 3.3 purchases
UPDATE public.purchases
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);

-- 3.4 mix_orders
UPDATE public.mix_orders
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);


-- ────────────────────────────────────────────────────────────────────────
-- STEP 4: Verification — count rows with invalid location_id AFTER fix
-- ────────────────────────────────────────────────────────────────────────
SELECT 'AFTER FIX' AS stage;
SELECT 'product_stock' AS table_name, COUNT(*) AS invalid_rows
FROM public.product_stock
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'sales', COUNT(*)
FROM public.sales
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'purchases', COUNT(*)
FROM public.purchases
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'mix_orders', COUNT(*)
FROM public.mix_orders
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);
-- Expected: ALL four rows show 0


-- ════════════════════════════════════════════════════════════════════════
-- NEXT STEPS — now that data is clean, re-run the original migration
-- ════════════════════════════════════════════════════════════════════════
-- After this fix completes successfully, re-run the FULL original migration
-- file: re-add-locations-farmhouse-shop.sql
--
-- It is now idempotent AND safe — Phase 2 has been updated to also catch
-- non-NULL invalid location_ids (NULL OR NOT IN locations), so Phase 4.1's
-- FK constraint will succeed.
--
-- You can also run re-add-locations-farmhouse-shop.sql directly without
-- running this fix first IF you re-run it from scratch — the updated
-- Phase 2 will repair the data automatically. This fix file is only needed
-- if you want to inspect/repair data WITHOUT touching constraints/functions.
-- ════════════════════════════════════════════════════════════════════════
