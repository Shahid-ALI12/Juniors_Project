-- ============================================================
-- MIGRATION: Sales NO LONGER decrement stock
--
-- BUSINESS DECISION (2026-07-13):
--   Previously, every sale (and every mix-order line) subtracted the
--   sold quantity from product_stock. The owner wants stock to remain
--   UNCHANGED on sales — stock is only INCREMENTED on purchases now.
--   The product_stock table keeps its current values; future sales
--   will not modify it.
--
-- WHAT THIS MIGRATION DOES:
--   1. DROPs + recreates `create_sale()` — removes the stock upsert +
--      decrement block. Still inserts sale rows + cash_ledger entry.
--   2. DROPs + recreates `create_mix_order()` — removes the stock
--      lookup + decrement block. Still inserts mix_orders + sale
--      lines + cash_ledger entry.
--   3. Leaves `record_purchase()` and `decrement_stock_fallback()`
--      UNTOUCHED — purchases still increment stock.
--
-- WHY DROP+CREATE instead of CREATE OR REPLACE:
--   PostgreSQL forbids CREATE OR REPLACE from changing a function's
--   RETURN TYPE. If your deployed `create_mix_order()` was an older
--   version that returned `void` or `bigint` (instead of the current
--   `TABLE(id bigint)`), CREATE OR REPLACE fails with
--   "cannot change return type of existing function". DROP+CREATE
--   sidesteps that — we explicitly drop the old definition first,
--   then create the new one with the desired return type.
--
-- RUN INSTRUCTIONS:
--   Open Supabase → SQL Editor → paste this whole file → Run.
--   Safe to re-run (DROP IF EXISTS + CREATE OR REPLACE pattern).
--   Brief moment where the function doesn't exist (between DROP and
--   CREATE) — if a sale arrives in that ~ms window it would error,
--   but in practice this is instant on Supabase.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- 1. create_sale — NO LONGER DECREMENTS STOCK
-- ════════════════════════════════════════════════════════════
-- DROP first to allow return-type changes from older deployed versions.
DROP FUNCTION IF EXISTS public.create_sale(jsonb,bigint,date,numeric,numeric,text,text,text,bigint);

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
  v_is_first boolean := true;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    -- ── Insert sale row ONLY (stock NOT decremented) ──
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

  IF p_cash_received > 0 THEN
    INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    SELECT p_sale_date, a.id, 'in', p_cash_received, 'sale', NULL,
           'Sale group ' || p_transaction_group_id
    FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;
  END IF;
END;
$$;

-- ════════════════════════════════════════════════════════════
-- 2. create_mix_order — NO LONGER DECREMENTS STOCK
-- ════════════════════════════════════════════════════════════
-- DROP first to allow return-type changes from older deployed versions
-- (older versions returned void or bigint; current returns TABLE(id bigint)).
DROP FUNCTION IF EXISTS public.create_mix_order(bigint,date,numeric,numeric,text,jsonb,text,numeric,bigint);

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

    -- ── Insert sale row ONLY (stock NOT decremented) ──
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
-- 3. Reload PostgREST schema cache so the new definitions take effect
-- ════════════════════════════════════════════════════════════
NOTIFY pgrst, 'reload schema';

-- ════════════════════════════════════════════════════════════
-- VERIFICATION (run these manually after, if you want to confirm):
--
--   -- Should show the new body with NO UPDATE product_stock inside:
--   SELECT prosrc FROM pg_proc WHERE proname = 'create_sale';
--   SELECT prosrc FROM pg_proc WHERE proname = 'create_mix_order';
--
--   -- record_purchase should STILL contain the stock increment
--   -- (we did not touch it):
--   SELECT prosrc FROM pg_proc WHERE proname = 'record_purchase';
-- ════════════════════════════════════════════════════════════
