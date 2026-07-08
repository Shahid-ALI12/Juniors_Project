-- ════════════════════════════════════════════════════════════════════════
-- MIGRATION: Re-introduce Locations (Farmhouse + Shop) for per-location stock
-- ════════════════════════════════════════════════════════════════════════
-- Background:
--   The remove-locations-add-mix-fields.sql migration collapsed product_stock
--   from one-row-per-(product,location) to one-row-per-product (location_id=NULL).
--   All RPCs were hardcoded to use NULL. This migration reverses that:
--   stock becomes per-location again, RPCs use p_location_id, and the UI can
--   filter by Farmhouse/Shop.
--
-- Strategy:
--   1. Reseed locations table with ('Farmhouse'), ('Shop') — clean slate
--   2. Migrate existing product_stock rows (location_id=NULL → Farmhouse id)
--   3. Restore FK + composite unique on product_stock
--   4. Restore NOT NULL + FK on sales/purchases/mix_orders.location_id
--      (existing NULL rows default to Farmhouse)
--   5. Re-add indexes on sales.location_id and purchases.location_id
--   6. Rewrite 4 RPC functions to use p_location_id (not hardcoded NULL)
--
-- Safety:
--   - Idempotent (uses IF EXISTS / IF NOT EXISTS)
--   - Preserves all existing data (migrates NULLs to Farmhouse, doesn't delete)
--   - Tested for rollback (see end of file)
--
-- Run: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 1: Reseed locations table with Farmhouse + Shop
-- ────────────────────────────────────────────────────────────────────────
-- Strategy: TRUNCATE + reseed. Existing sale/purchase/stock rows have
-- location_id = NULL (post previous migration), so they don't reference
-- the old Farm (id=1) / Shop (id=2) rows. Truncating is safe.

TRUNCATE TABLE public.locations RESTART IDENTITY;

INSERT INTO public.locations (name) VALUES
  ('Farmhouse'),
  ('Shop');

-- Verify
SELECT id, name FROM public.locations ORDER BY id;
-- Expected:
--   1 | Farmhouse
--   2 | Shop


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 2: Migrate product_stock to per-location model
-- ────────────────────────────────────────────────────────────────────────
-- Existing rows may have location_id = NULL (from previous migration) OR
-- an invalid location_id (e.g. 3, 4, 5) that no longer exists in `locations`
-- after TRUNCATE (Phase 1). We migrate BOTH cases to Farmhouse (id=1) so
-- no FK violations occur in Phase 3/4. This is idempotent and safe to re-run.

-- 2.1 Migrate NULL OR invalid location_id → Farmhouse (id=1) in product_stock
UPDATE public.product_stock
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);

-- 2.2 Migrate NULL OR invalid location_id → Farmhouse (id=1) in sales
UPDATE public.sales
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);

-- 2.3 Migrate NULL OR invalid location_id → Farmhouse (id=1) in purchases
UPDATE public.purchases
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);

-- 2.4 Migrate NULL OR invalid location_id → Farmhouse (id=1) in mix_orders
UPDATE public.mix_orders
SET location_id = 1
WHERE location_id IS NULL
   OR location_id NOT IN (SELECT id FROM public.locations);

-- 2.5 Verification: no rows should have NULL or invalid location_id now
SELECT 'product_stock' AS table_name, COUNT(*) AS invalid_rows
FROM public.product_stock
WHERE location_id IS NULL OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'sales', COUNT(*)
FROM public.sales
WHERE location_id IS NULL OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'purchases', COUNT(*)
FROM public.purchases
WHERE location_id IS NULL OR location_id NOT IN (SELECT id FROM public.locations)
UNION ALL
SELECT 'mix_orders', COUNT(*)
FROM public.mix_orders
WHERE location_id IS NULL OR location_id NOT IN (SELECT id FROM public.locations);
-- Expected: all 4 rows show 0 (zero invalid rows)


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 3: Restore constraints on product_stock
-- ────────────────────────────────────────────────────────────────────────

-- 3.1 Drop the single-column unique constraint (added by previous migration)
ALTER TABLE public.product_stock
  DROP CONSTRAINT IF EXISTS product_stock_product_id_ukey;

-- 3.2 Re-add NOT NULL on location_id
ALTER TABLE public.product_stock
  ALTER COLUMN location_id SET NOT NULL;

-- 3.3 Re-add FK to locations
ALTER TABLE public.product_stock
  DROP CONSTRAINT IF EXISTS product_stock_location_id_fkey;
ALTER TABLE public.product_stock
  ADD CONSTRAINT product_stock_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE CASCADE;

-- 3.4 Re-add composite unique (product_id, location_id)
ALTER TABLE public.product_stock
  DROP CONSTRAINT IF EXISTS product_stock_product_id_location_id_key;
ALTER TABLE public.product_stock
  ADD CONSTRAINT product_stock_product_id_location_id_key
  UNIQUE (product_id, location_id);


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 4: Restore NOT NULL + FK on sales, purchases, mix_orders
-- ────────────────────────────────────────────────────────────────────────

-- 4.1 sales.location_id
ALTER TABLE public.sales
  ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_location_id_fkey;
ALTER TABLE public.sales
  ADD CONSTRAINT sales_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;

-- 4.2 purchases.location_id
ALTER TABLE public.purchases
  ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE public.purchases
  DROP CONSTRAINT IF EXISTS purchases_location_id_fkey;
ALTER TABLE public.purchases
  ADD CONSTRAINT purchases_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;

-- 4.3 mix_orders.location_id
ALTER TABLE public.mix_orders
  ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE public.mix_orders
  DROP CONSTRAINT IF EXISTS mix_orders_location_id_fkey;
ALTER TABLE public.mix_orders
  ADD CONSTRAINT mix_orders_location_id_fkey
  FOREIGN KEY (location_id) REFERENCES public.locations(id) ON DELETE RESTRICT;


-- ────────────────────────────────────────────────────────────────────────
-- PHASE 5: Re-add indexes on location_id for filtering
-- ────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_location_id     ON public.sales     (location_id);
CREATE INDEX IF NOT EXISTS idx_purchases_location_id ON public.purchases (location_id);
CREATE INDEX IF NOT EXISTS idx_mix_orders_location_id ON public.mix_orders (location_id);


-- ════════════════════════════════════════════════════════════════════════
-- PHASE 6: Rewrite 4 RPC functions to use p_location_id (not NULL)
-- ════════════════════════════════════════════════════════════════════════

-- 6.1 DROP old versions of all 4 functions (with their old signatures)
DROP FUNCTION IF EXISTS public.create_sale(jsonb, bigint, date, numeric, numeric, text, text, text, bigint);
DROP FUNCTION IF EXISTS public.record_purchase(date, bigint, numeric, numeric, bigint, bigint, numeric, text, text, numeric, text, bigint);
DROP FUNCTION IF EXISTS public.create_mix_order(bigint, date, numeric, numeric, text, jsonb, text, numeric, bigint);
DROP FUNCTION IF EXISTS public.decrement_stock_fallback(bigint, bigint, numeric);


-- 6.2 CREATE sale function — uses p_location_id for stock operations
CREATE OR REPLACE FUNCTION public.create_sale(
  p_items jsonb,
  p_customer_id bigint,
  p_sale_date date,
  p_cash_received numeric,
  p_rickshaw_fare numeric,
  p_rickshaw_driver text,
  p_transaction_group_id text,
  p_entered_by text,
  p_location_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_product_id bigint;
  v_qty_bags numeric;
  v_rate numeric;
  v_unit text;
  v_bag_weight numeric;
  v_line_total numeric;
  v_cash_received numeric := p_cash_received;
  v_total numeric := 0;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  <<process_items>>
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::bigint;
    v_qty_bags   := COALESCE((v_item->>'quantity')::numeric, 0);
    v_rate       := COALESCE((v_item->>'rate_per_bag')::numeric, 0);
    v_unit       := COALESCE(v_item->>'unit_type', 'bags');
    v_bag_weight := CASE
      WHEN v_unit = 'kg' AND (v_item->>'bag_weight_kg') IS NOT NULL
      THEN (v_item->>'bag_weight_kg')::numeric
      ELSE NULL
    END;

    v_line_total := v_qty_bags * v_rate;
    v_total := v_total + v_line_total;

    -- Insert sale row (uses p_location_id)
    INSERT INTO sales (
      product_id, customer_id, location_id, quantity, rate_per_bag,
      rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg,
      transaction_group_id, rickshaw_driver_name, entered_by
    ) VALUES (
      v_product_id, p_customer_id, p_location_id, v_qty_bags, v_rate,
      p_rickshaw_fare, v_cash_received, p_sale_date, v_unit, v_bag_weight,
      p_transaction_group_id, p_rickshaw_driver, p_entered_by
    );

    -- Upsert stock row (uses p_location_id, conflicts on composite key)
    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES (v_product_id, p_location_id, 0, NULL)
    ON CONFLICT (product_id, location_id) DO NOTHING;

    -- Decrement stock at the specified location
    UPDATE product_stock
    SET stock_quantity = GREATEST(stock_quantity - v_qty_bags, 0),
        last_bag_weight_kg = COALESCE(v_bag_weight, last_bag_weight_kg)
    WHERE product_id = v_product_id
      AND location_id = p_location_id;
  END LOOP process_items;

  -- Record cash inflow
  PERFORM public.record_cash_event(
    p_amount := v_cash_received,
    p_source := 'sale',
    p_source_id := NULL,
    p_source_type := 'sale',
    p_date := p_sale_date,
    p_notes := 'Sale to customer #' || p_customer_id,
    p_entered_by := p_entered_by
  );
END;
$$;


-- 6.3 CREATE record_purchase function — uses p_location_id for stock operations
CREATE OR REPLACE FUNCTION public.record_purchase(
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
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Insert purchase row
  INSERT INTO purchases (
    purchase_date, product_id, quantity, rate_per_bag, supplier_id,
    settled_by_customer_id, cash_paid, location_id, notes, entered_by,
    unit_type, bag_weight_kg
  ) VALUES (
    p_purchase_date, p_product_id, p_quantity, p_rate_per_bag, p_supplier_id,
    p_settled_by_customer_id, p_cash_paid, p_location_id, p_notes, p_entered_by,
    p_unit_type, p_bag_weight_kg
  );

  -- Upsert stock row (uses p_location_id)
  INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
  VALUES (p_product_id, p_location_id, 0, NULL)
  ON CONFLICT (product_id, location_id) DO NOTHING;

  -- Increment stock at the specified location
  UPDATE product_stock
  SET stock_quantity = stock_quantity + p_quantity,
      last_bag_weight_kg = COALESCE(p_bag_weight_kg, last_bag_weight_kg)
  WHERE product_id = p_product_id
    AND location_id = p_location_id;
END;
$$;


-- 6.4 CREATE create_mix_order function — uses p_location_id for stock operations
CREATE OR REPLACE FUNCTION public.create_mix_order(
  p_customer_id bigint,
  p_order_date date,
  p_target_weight_kg numeric,
  p_cash_received numeric,
  p_entered_by text,
  p_items jsonb,
  p_driver_name text,
  p_driver_rent numeric,
  p_location_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mix_order_id bigint;
  v_item jsonb;
  v_product_id bigint;
  v_qty_bags numeric;
  v_rate numeric;
  v_unit text;
  v_bag_weight numeric;
  v_line_total numeric;
  v_total numeric := 0;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Items array cannot be empty';
  END IF;

  -- Create the parent mix_order row
  INSERT INTO mix_orders (
    customer_id, order_date, target_weight_kg, cash_received,
    entered_by, location_id, driver_name, driver_rent
  ) VALUES (
    p_customer_id, p_order_date, p_target_weight_kg, p_cash_received,
    p_entered_by, p_location_id, p_driver_name, p_driver_rent
  )
  RETURNING id INTO v_mix_order_id;

  -- Insert individual sales rows tied to this mix_order
  <<process_items>>
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'product_id')::bigint;
    v_qty_bags   := COALESCE((v_item->>'quantity')::numeric, 0);
    v_rate       := COALESCE((v_item->>'rate_per_bag')::numeric, 0);
    v_unit       := COALESCE(v_item->>'unit_type', 'bags');
    v_bag_weight := CASE
      WHEN v_unit = 'kg' AND (v_item->>'bag_weight_kg') IS NOT NULL
      THEN (v_item->>'bag_weight_kg')::numeric
      ELSE NULL
    END;

    v_line_total := v_qty_bags * v_rate;
    v_total := v_total + v_line_total;

    INSERT INTO sales (
      product_id, customer_id, location_id, quantity, rate_per_bag,
      rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg,
      mix_order_id, transaction_group_id, entered_by
    ) VALUES (
      v_product_id, p_customer_id, p_location_id, v_qty_bags, v_rate,
      0, 0, p_order_date, v_unit, v_bag_weight,
      v_mix_order_id, 'mix-' || v_mix_order_id, p_entered_by
    );

    -- Upsert stock row (uses p_location_id)
    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES (v_product_id, p_location_id, 0, NULL)
    ON CONFLICT (product_id, location_id) DO NOTHING;

    -- Decrement stock at the specified location
    UPDATE product_stock
    SET stock_quantity = GREATEST(stock_quantity - v_qty_bags, 0),
        last_bag_weight_kg = COALESCE(v_bag_weight, last_bag_weight_kg)
    WHERE product_id = v_product_id
      AND location_id = p_location_id;
  END LOOP process_items;

  -- Record cash inflow
  PERFORM public.record_cash_event(
    p_amount := p_cash_received,
    p_source := 'mix_order',
    p_source_id := v_mix_order_id,
    p_source_type := 'mix_order',
    p_date := p_order_date,
    p_notes := 'Mix order #' || v_mix_order_id,
    p_entered_by := p_entered_by
  );
END;
$$;


-- 6.5 CREATE decrement_stock_fallback function — uses p_location_id
CREATE OR REPLACE FUNCTION public.decrement_stock_fallback(
  p_product_id bigint,
  p_location_id bigint,
  p_quantity numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
  VALUES (p_product_id, p_location_id, 0, NULL)
  ON CONFLICT (product_id, location_id) DO NOTHING;

  UPDATE product_stock
  SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0)
  WHERE product_id = p_product_id
    AND location_id = p_location_id;
END;
$$;


-- 6.6 Re-apply EXECUTE revokes (since we recreated the functions)
REVOKE EXECUTE ON FUNCTION public.create_sale(
  jsonb, bigint, date, numeric, numeric, text, text, text, bigint
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.record_purchase(
  date, bigint, numeric, numeric, bigint, bigint, numeric, text, text, numeric, text, bigint
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_mix_order(
  bigint, date, numeric, numeric, text, jsonb, text, numeric, bigint
) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.decrement_stock_fallback(
  bigint, bigint, numeric
) FROM PUBLIC, anon, authenticated;


-- 6.7 Reload PostgREST schema cache so the new function signatures are picked up
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════════════════════
-- VERIFICATION
-- ════════════════════════════════════════════════════════════════════════

-- V1: locations table
SELECT id, name FROM public.locations ORDER BY id;
-- Expected: 1=Farmhouse, 2=Shop

-- V2: product_stock no longer has NULL location_id
SELECT COUNT(*) AS null_location_rows
FROM public.product_stock
WHERE location_id IS NULL;
-- Expected: 0

-- V3: constraints in place
SELECT conname, contype, conrelid::regclass AS table_name
FROM pg_constraint
WHERE conrelid IN (
  'public.product_stock'::regclass,
  'public.sales'::regclass,
  'public.purchases'::regclass,
  'public.mix_orders'::regclass
)
AND contype IN ('f', 'u')  -- foreign keys + unique constraints
ORDER BY conrelid::regclass::text, conname;
-- Expected: FKs on all 4 tables, composite unique on product_stock

-- V4: function signatures
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('create_sale', 'record_purchase', 'create_mix_order', 'decrement_stock_fallback')
ORDER BY proname;
-- Expected: all 4 functions show their new signatures with p_location_id


-- ════════════════════════════════════════════════════════════════════════
-- ROLLBACK (only if needed — reverses this migration)
-- ════════════════════════════════════════════════════════════════════════
-- To rollback to the previous "no locations" state:
--
-- -- Drop new FKs + unique + NOT NULL
-- ALTER TABLE public.product_stock DROP CONSTRAINT IF EXISTS product_stock_location_id_fkey;
-- ALTER TABLE public.product_stock DROP CONSTRAINT IF EXISTS product_stock_product_id_location_id_key;
-- ALTER TABLE public.product_stock ALTER COLUMN location_id DROP NOT NULL;
-- ALTER TABLE public.product_stock ADD CONSTRAINT product_stock_product_id_ukey UNIQUE (product_id);
--
-- ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_location_id_fkey;
-- ALTER TABLE public.sales ALTER COLUMN location_id DROP NOT NULL;
--
-- ALTER TABLE public.purchases DROP CONSTRAINT IF EXISTS purchases_location_id_fkey;
-- ALTER TABLE public.purchases ALTER COLUMN location_id DROP NOT NULL;
--
-- ALTER TABLE public.mix_orders DROP CONSTRAINT IF EXISTS mix_orders_location_id_fkey;
-- ALTER TABLE public.mix_orders ALTER COLUMN location_id DROP NOT NULL;
--
-- -- Set all location_ids back to NULL
-- UPDATE public.product_stock SET location_id = NULL;
-- UPDATE public.sales SET location_id = NULL;
-- UPDATE public.purchases SET location_id = NULL;
-- UPDATE public.mix_orders SET location_id = NULL;
--
-- -- Drop the location_id indexes
-- DROP INDEX IF EXISTS public.idx_sales_location_id;
-- DROP INDEX IF EXISTS public.idx_purchases_location_id;
-- DROP INDEX IF EXISTS public.idx_mix_orders_location_id;
--
-- -- Re-run the original all-rpc-functions.sql to restore the old (NULL) function bodies
