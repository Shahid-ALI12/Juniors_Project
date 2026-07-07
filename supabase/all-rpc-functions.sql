-- ============================================================
-- STEP 1: DROP old functions (scalar return types)
-- Run this FIRST in Supabase SQL Editor
--
-- ⚠️ UPDATED for "remove locations" migration:
--   - create_sale, record_purchase, create_mix_order now accept
--     p_location_id as the LAST parameter (so it can be optional
--     with a DEFAULT NULL).
--   - create_mix_order now also accepts p_driver_name + p_driver_rent.
-- ============================================================

DROP FUNCTION IF EXISTS public.record_purchase(date,bigint,numeric,numeric,bigint,bigint,numeric,bigint,text,text,numeric,text);
DROP FUNCTION IF EXISTS public.record_expense(text,numeric,date,text);
DROP FUNCTION IF EXISTS public.transfer_cash(bigint,bigint,numeric,date,text,text);
DROP FUNCTION IF EXISTS public.correct_cash_balance(bigint,numeric,date,text);
DROP FUNCTION IF EXISTS public.create_mix_order(bigint,bigint,date,numeric,numeric,text,jsonb);
DROP FUNCTION IF EXISTS public.create_sale(jsonb,bigint,bigint,date,numeric,numeric,text,text,text);
DROP FUNCTION IF EXISTS public.verify_customer_login(text,text);
DROP FUNCTION IF EXISTS public.decrement_stock_fallback(bigint,bigint,numeric);

-- ============================================================
-- STEP 2: CREATE all functions (locations removed + mix order driver fields)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. verify_customer_login
CREATE OR REPLACE FUNCTION verify_customer_login(p_email text, p_password text)
RETURNS TABLE (
  id text, name text, email text,
  subscription_type text, subscription_start date,
  subscription_end date, is_active boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_row app_customers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM app_customers WHERE email = lower(p_email) LIMIT 1;
  IF v_row.id IS NULL THEN RETURN; END IF;
  IF v_row.password = crypt(p_password, v_row.password) THEN
    RETURN QUERY SELECT
      v_row.id, v_row.name, v_row.email, v_row.subscription_type,
      v_row.subscription_start, v_row.subscription_end, v_row.is_active;
  END IF;
END;
$$;

-- 2. create_sale
-- p_location_id is now the LAST parameter and defaults to NULL
-- (so the locations concept is fully optional going forward).
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
  v_ps record;
  v_is_first boolean := true;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'unit_type') = 'bags' AND p_location_id IS NOT NULL THEN
      SELECT * INTO v_ps FROM product_stock
        WHERE product_id = (v_item->>'product_id')::bigint
          AND location_id = p_location_id
        FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
        VALUES ((v_item->>'product_id')::bigint, p_location_id, 0, null);
      END IF;
      UPDATE product_stock SET
        stock_quantity = stock_quantity - (v_item->>'quantity')::numeric,
        last_bag_weight_kg = coalesce((v_item->>'bag_weight_kg')::numeric, last_bag_weight_kg)
      WHERE product_id = (v_item->>'product_id')::bigint
        AND location_id = p_location_id;
    END IF;

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

-- 3. record_purchase
-- p_location_id is now the LAST parameter and defaults to NULL.
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

  IF p_unit_type = 'bags' AND p_location_id IS NOT NULL THEN
    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES (p_product_id, p_location_id, p_quantity, p_bag_weight_kg)
    ON CONFLICT (product_id, location_id) DO UPDATE
      SET stock_quantity = product_stock.stock_quantity + excluded.stock_quantity,
          last_bag_weight_kg = coalesce(excluded.last_bag_weight_kg, product_stock.last_bag_weight_kg);
  END IF;

  IF p_settled_by_customer_id IS NULL AND p_cash_paid > 0 THEN
    INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    SELECT p_purchase_date, a.id, 'out', p_cash_paid, 'purchase', v_id,
           'Purchase #' || v_id
    FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_id;
END;
$$;

-- 4. record_expense
CREATE OR REPLACE FUNCTION record_expense(
  p_description text, p_amount numeric, p_expense_date date, p_entered_by text
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO expenses (description, amount, expense_date, entered_by)
  VALUES (p_description, p_amount, p_expense_date, p_entered_by)
  RETURNING expenses.id INTO v_id;

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  SELECT p_expense_date, a.id, 'out', p_amount, 'expense', v_id, p_description
  FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;

  RETURN QUERY SELECT v_id;
END;
$$;

-- 5. transfer_cash
CREATE OR REPLACE FUNCTION transfer_cash(
  p_from_account_id bigint, p_to_account_id bigint, p_amount numeric,
  p_date date, p_notes text, p_entered_by text
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  IF p_from_account_id = p_to_account_id THEN
    RAISE EXCEPTION 'from_account_id and to_account_id must be different';
  END IF;

  INSERT INTO cash_transfers (transfer_date, from_account_id, to_account_id, amount, notes, entered_by)
  VALUES (p_date, p_from_account_id, p_to_account_id, p_amount, p_notes, p_entered_by)
  RETURNING cash_transfers.id INTO v_id;

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  VALUES (p_date, p_from_account_id, 'out', p_amount, 'transfer', v_id, 'Transfer out #' || v_id);

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  VALUES (p_date, p_to_account_id, 'in', p_amount, 'transfer', v_id, 'Transfer in #' || v_id);

  RETURN QUERY SELECT v_id;
END;
$$;

-- 6. correct_cash_balance
CREATE OR REPLACE FUNCTION correct_cash_balance(
  p_account_id bigint, p_target numeric, p_date date, p_entered_by text
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_current numeric(14,2);
  v_diff   numeric(14,2);
  v_dir    text;
  v_id     bigint;
BEGIN
  SELECT coalesce(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END), 0)
    INTO v_current FROM cash_ledger WHERE account_id = p_account_id;

  v_diff := p_target - v_current;
  IF v_diff = 0 THEN RETURN; END IF;
  v_dir := CASE WHEN v_diff > 0 THEN 'in' ELSE 'out' END;

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  VALUES (p_date, p_account_id, v_dir, abs(v_diff), 'correction', NULL, 'Manual balance correction')
  RETURNING cash_ledger.id INTO v_id;

  RETURN QUERY SELECT v_id;
END;
$$;

-- 7. create_mix_order
-- NEW signature:
--   - p_location_id is now OPTIONAL (last positional arg, defaults to NULL)
--   - p_driver_name + p_driver_rent are new (order-level driver info)
--   - p_items JSONB entries can now optionally include rate_per_bag + bags
--     (each ingredient may have an optional bag-based rate alongside
--     the required rate_per_kg).
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
    INSERT INTO sales (
      customer_id, product_id, location_id, quantity, rate_per_bag,
      rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg,
      mix_order_id, entered_by
    ) VALUES (
      p_customer_id,
      (v_item->>'product_id')::bigint,
      p_location_id,
      (v_item->>'quantity')::numeric,
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

-- 8. decrement_stock_fallback
CREATE OR REPLACE FUNCTION decrement_stock_fallback(
  p_product_id bigint,
  p_location_id bigint,
  p_quantity numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_location_id IS NULL THEN RETURN; END IF;
  INSERT INTO product_stock (product_id, location_id, stock_quantity)
  VALUES (p_product_id, p_location_id, 0)
  ON CONFLICT (product_id, location_id) DO NOTHING;

  UPDATE product_stock
  SET stock_quantity = stock_quantity - p_quantity
  WHERE product_id = p_product_id
    AND location_id = p_location_id;
END;
$$;

-- ============================================================
-- RELOAD PostgREST schema cache
-- ============================================================
NOTIFY pgrst, 'reload schema';
