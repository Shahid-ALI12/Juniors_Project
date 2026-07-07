-- ============================================================
-- FIX: Stock decrement/increment now works without location_id
--
-- PROBLEM:
--   After removing the "locations" concept, p_location_id is
--   always NULL. But the SQL functions had checks like
--   "IF p_location_id IS NOT NULL" before touching stock,
--   so stock was NEVER updated when sales/purchases happened.
--
-- FIX:
--   1. create_sale  → always decrement stock (handle bags & kg)
--   2. record_purchase → always increment stock
--   3. create_mix_order → also decrement stock (kg → bags conversion)
--   4. decrement_stock_fallback → allow NULL location_id
--
-- Run this in Supabase SQL Editor AFTER all-rpc-functions.sql.
-- Safe to re-run (uses CREATE OR REPLACE).
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. create_sale — ALWAYS decrement stock (regardless of location_id)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_sale(
  p_items jsonb,
  p_customer_id bigint,
  p_sale_date date,
  p_cash_received numeric,
  p_rickshaw_fare numeric,
  p_rickshaw_driver text,
  p_transaction_group_id text,
  p_entered_by text,
  p_location_id bigint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_qty_bags numeric;
  v_bw numeric;
  v_is_first boolean := true;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- ── Calculate how many BAGS to remove from stock ──
    v_qty_bags := (v_item->>'quantity')::numeric;
    v_bw := coalesce(nullif(v_item->>'bag_weight_kg','')::numeric, 50);

    IF coalesce(v_item->>'unit_type','bags') = 'kg' THEN
      -- Convert kg → bags (so stock_quantity which is in bags stays consistent)
      v_qty_bags := CASE WHEN v_bw > 0 THEN v_qty_bags / v_bw ELSE v_qty_bags END;
    END IF;

    -- ── Upsert stock row (location_id NULL is the new normal) ──
    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES ((v_item->>'product_id')::bigint, NULL, 0, NULL)
    ON CONFLICT (product_id) DO NOTHING;

    -- ── Decrement stock by bags equivalent (clamped to 0) ──
    UPDATE product_stock SET
      stock_quantity = GREATEST(stock_quantity - v_qty_bags, 0),
      last_bag_weight_kg = coalesce(
        nullif(v_item->>'bag_weight_kg','')::numeric,
        last_bag_weight_kg
      )
    WHERE product_id = (v_item->>'product_id')::bigint
      AND location_id IS NULL;

    -- ── Insert sale row ──
    INSERT INTO sales (
      customer_id, product_id, location_id, quantity, rate_per_bag,
      rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg,
      transaction_group_id, rickshaw_driver_name, entered_by
    ) VALUES (
      p_customer_id,
      (v_item->>'product_id')::bigint,
      p_location_id,
      (v_item->>'quantity')::numeric,
      (v_item->>'rate_per_bag')::numeric,
      CASE WHEN v_is_first THEN p_rickshaw_fare ELSE 0 END,
      CASE WHEN v_is_first THEN p_cash_received ELSE 0 END,
      p_sale_date,
      coalesce(v_item->>'unit_type','bags'),
      nullif(v_item->>'bag_weight_kg','')::numeric,
      p_transaction_group_id,
      p_rickshaw_driver,
      p_entered_by
    );
    v_is_first := false;
  END LOOP;

  -- ── Cash ledger entry (if any cash received) ──
  IF p_cash_received > 0 THEN
    INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    SELECT p_sale_date, a.id, 'in', p_cash_received, 'sale', NULL,
           'Sale group ' || p_transaction_group_id
    FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 2. record_purchase — ALWAYS increment stock
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION record_purchase(
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
  p_location_id bigint DEFAULT NULL
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_qty_bags numeric;
  v_bw numeric;
BEGIN
  INSERT INTO purchases (
    purchase_date, product_id, quantity, rate_per_bag, supplier_id,
    settled_by_customer_id, cash_paid, location_id, notes, entered_by,
    unit_type, bag_weight_kg
  ) VALUES (
    p_purchase_date, p_product_id, p_quantity, p_rate_per_bag, p_supplier_id,
    p_settled_by_customer_id, p_cash_paid, p_location_id, p_notes, p_entered_by,
    p_unit_type, p_bag_weight_kg
  ) RETURNING purchases.id INTO v_id;

  -- ── Calculate bags to add to stock ──
  v_qty_bags := p_quantity;
  v_bw := coalesce(p_bag_weight_kg, 50);
  IF p_unit_type = 'kg' THEN
    v_qty_bags := CASE WHEN v_bw > 0 THEN v_qty_bags / v_bw ELSE v_qty_bags END;
  END IF;

  -- ── Always increment stock (location_id NULL) ──
  INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
  VALUES (p_product_id, NULL, v_qty_bags, p_bag_weight_kg)
  ON CONFLICT (product_id) DO UPDATE
    SET stock_quantity = product_stock.stock_quantity + excluded.stock_quantity,
        last_bag_weight_kg = coalesce(excluded.last_bag_weight_kg, product_stock.last_bag_weight_kg);

  -- ── Cash ledger (only for supplier purchases with cash, not goods settlements) ──
  IF p_settled_by_customer_id IS NULL AND p_cash_paid > 0 THEN
    INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    SELECT p_purchase_date, a.id, 'out', p_cash_paid, 'purchase', v_id,
           'Purchase #' || v_id
    FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_id;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 3. create_mix_order — ALSO decrement stock (convert kg → bags)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION create_mix_order(
  p_customer_id bigint,
  p_order_date date,
  p_target_weight_kg numeric,
  p_cash_received numeric,
  p_entered_by text,
  p_items jsonb,
  p_driver_name text DEFAULT NULL,
  p_driver_rent numeric DEFAULT 0,
  p_location_id bigint DEFAULT NULL
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_mix_id bigint;
  v_item jsonb;
  v_qty_kg numeric;
  v_bw numeric;
  v_existing_bw numeric;
BEGIN
  INSERT INTO mix_orders (
    customer_id, location_id, order_date, target_weight_kg,
    cash_received, entered_by, driver_name, driver_rent
  ) VALUES (
    p_customer_id, p_location_id, p_order_date, p_target_weight_kg,
    p_cash_received, p_entered_by, p_driver_name, p_driver_rent
  )
  RETURNING mix_orders.id INTO v_mix_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty_kg := (v_item->>'quantity')::numeric;

    -- ── Decrement stock (kg → bags) ──
    -- Use last known bag weight for this product, fallback to 50
    SELECT last_bag_weight_kg INTO v_existing_bw
      FROM product_stock
      WHERE product_id = (v_item->>'product_id')::bigint
        AND location_id IS NULL
      LIMIT 1;
    v_bw := coalesce(v_existing_bw, 50);

    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES ((v_item->>'product_id')::bigint, NULL, 0, NULL)
    ON CONFLICT (product_id) DO NOTHING;

    UPDATE product_stock SET
      stock_quantity = GREATEST(
        stock_quantity - CASE WHEN v_bw > 0 THEN v_qty_kg / v_bw ELSE v_qty_kg END,
        0
      )
    WHERE product_id = (v_item->>'product_id')::bigint
      AND location_id IS NULL;

    -- ── Insert sale row ──
    INSERT INTO sales (
      customer_id, product_id, location_id, quantity, rate_per_bag,
      rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg,
      mix_order_id, entered_by
    ) VALUES (
      p_customer_id,
      (v_item->>'product_id')::bigint,
      p_location_id,
      v_qty_kg,
      (v_item->>'rate_per_kg')::numeric,
      0, 0,
      p_order_date,
      'kg',
      NULL,
      v_mix_id,
      p_entered_by
    );
  END LOOP;

  IF p_cash_received > 0 THEN
    INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    SELECT p_order_date, a.id, 'in', p_cash_received, 'sale', NULL,
           'Mix order #' || v_mix_id
    FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_mix_id;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 4. decrement_stock_fallback — allow NULL location_id
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION decrement_stock_fallback(
  p_product_id bigint,
  p_location_id bigint,
  p_quantity numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert placeholder stock row if missing (location_id NULL or given)
  INSERT INTO product_stock (product_id, location_id, stock_quantity)
  VALUES (p_product_id, p_location_id, 0)
  ON CONFLICT (product_id) DO NOTHING;

  -- Decrement (location_id can be NULL now)
  UPDATE product_stock
  SET stock_quantity = GREATEST(stock_quantity - p_quantity, 0)
  WHERE product_id = p_product_id
    AND (location_id IS NOT DISTINCT FROM p_location_id);
END;
$$;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
