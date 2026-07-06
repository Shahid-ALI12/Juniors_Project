-- ============================================================
-- FIX: "column reference 'id' is ambiguous"
-- ============================================================
-- PROBLEM:
--   record_purchase (and friends) declared `RETURNS TABLE(id bigint)`,
--   which made the function's own output column `id` shadow the
--   `purchases.id` column inside `INSERT ... RETURNING id`.
--   Postgres throws: column reference "id" is ambiguous
--
-- FIX:
--   Qualify every `RETURNING id` as `RETURNING <table>.id`.
--   Safe to re-run. Only touches function definitions, NOT data.
--
-- Run this in: Supabase Dashboard → SQL Editor → New query → Run
-- ============================================================

-- Drop old definitions (signatures unchanged, just being safe)
DROP FUNCTION IF EXISTS public.record_purchase(date,bigint,numeric,numeric,bigint,bigint,numeric,bigint,text,text,numeric,text);
DROP FUNCTION IF EXISTS public.record_expense(text,numeric,date,text);
DROP FUNCTION IF EXISTS public.transfer_cash(bigint,bigint,numeric,date,text,text);
DROP FUNCTION IF EXISTS public.correct_cash_balance(bigint,numeric,date,text);
DROP FUNCTION IF EXISTS public.create_mix_order(bigint,bigint,date,numeric,numeric,text,jsonb);

-- ============================================================
-- 1. record_purchase — qualified RETURNING purchases.id
-- ============================================================
CREATE OR REPLACE FUNCTION record_purchase(
  p_purchase_date date,
  p_product_id bigint,
  p_quantity numeric,
  p_rate_per_bag numeric,
  p_supplier_id bigint,
  p_settled_by_customer_id bigint,
  p_cash_paid numeric,
  p_location_id bigint,
  p_notes text,
  p_unit_type text,
  p_bag_weight_kg numeric,
  p_entered_by text
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
  ) RETURNING purchases.id INTO v_id;   -- <-- qualified: no longer ambiguous

  -- increment stock for bag-type purchases
  IF p_unit_type = 'bags' THEN
    INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
    VALUES (p_product_id, p_location_id, p_quantity, p_bag_weight_kg)
    ON CONFLICT (product_id, location_id) DO UPDATE
      SET stock_quantity = product_stock.stock_quantity + excluded.stock_quantity,
          last_bag_weight_kg = coalesce(excluded.last_bag_weight_kg, product_stock.last_bag_weight_kg);
  END IF;

  -- cash out only when not a goods settlement and cash was paid
  IF p_settled_by_customer_id IS NULL AND p_cash_paid > 0 THEN
    INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    SELECT p_purchase_date, a.id, 'out', p_cash_paid, 'purchase', v_id,
           'Purchase #' || v_id
    FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_id;
END;
$$;

-- ============================================================
-- 2. record_expense — qualified RETURNING expenses.id
-- ============================================================
CREATE OR REPLACE FUNCTION record_expense(
  p_description text, p_amount numeric, p_expense_date date, p_entered_by text
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO expenses (description, amount, expense_date, entered_by)
  VALUES (p_description, p_amount, p_expense_date, p_entered_by)
  RETURNING expenses.id INTO v_id;   -- <-- qualified

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  SELECT p_expense_date, a.id, 'out', p_amount, 'expense', v_id, p_description
  FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;

  RETURN QUERY SELECT v_id;
END;
$$;

-- ============================================================
-- 3. transfer_cash — qualified RETURNING cash_transfers.id
-- ============================================================
CREATE OR REPLACE FUNCTION transfer_cash(
  p_from_account_id bigint, p_to_account_id bigint, p_amount numeric,
  p_date date, p_notes text, p_entered_by text
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_id bigint;
BEGIN
  INSERT INTO cash_transfers (transfer_date, from_account_id, to_account_id, amount, notes, entered_by)
  VALUES (p_date, p_from_account_id, p_to_account_id, p_amount, p_notes, p_entered_by)
  RETURNING cash_transfers.id INTO v_id;   -- <-- qualified

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  SELECT p_date, p_from_account_id, 'out', p_amount, 'transfer', v_id, p_notes
  FROM cash_accounts a WHERE a.id = p_from_account_id LIMIT 1;

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
  SELECT p_date, p_to_account_id, 'in', p_amount, 'transfer', v_id, p_notes
  FROM cash_accounts a WHERE a.id = p_to_account_id LIMIT 1;

  RETURN QUERY SELECT v_id;
END;
$$;

-- ============================================================
-- 4. correct_cash_balance — qualified RETURNING cash_ledger.id
-- ============================================================
CREATE OR REPLACE FUNCTION correct_cash_balance(
  p_account_id bigint, p_new_balance numeric, p_date date, p_entered_by text
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_old numeric;
  v_diff numeric;
BEGIN
  SELECT coalesce(sum(case when direction='in' then amount else -amount end),0)
    INTO v_old
    FROM cash_ledger
    WHERE account_id = p_account_id;

  v_diff := p_new_balance - v_old;

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description, entered_by)
  VALUES (p_date, p_account_id,
          CASE WHEN v_diff >= 0 THEN 'in' ELSE 'out' END,
          abs(v_diff),
          'correction', null,
          'Balance correction: old ' || v_old || ' → new ' || p_new_balance,
          p_entered_by)
  RETURNING cash_ledger.id INTO v_id;   -- <-- qualified

  RETURN QUERY SELECT v_id;
END;
$$;

-- ============================================================
-- 5. create_mix_order — qualified RETURNING mix_orders.id
-- ============================================================
CREATE OR REPLACE FUNCTION create_mix_order(
  p_customer_id bigint,
  p_location_id bigint,
  p_order_date date,
  p_target_weight_kg numeric,
  p_cash_received numeric,
  p_entered_by text,
  p_items jsonb
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_item jsonb;
BEGIN
  INSERT INTO mix_orders (customer_id, location_id, order_date, target_weight_kg, cash_received, entered_by)
  VALUES (p_customer_id, p_location_id, p_order_date, p_target_weight_kg, p_cash_received, p_entered_by)
  RETURNING mix_orders.id INTO v_id;   -- <-- qualified

  -- Call create_sale with the mix_order_id baked into each item
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
      (v_item->>'rate_per_bag')::numeric,
      0,
      0,
      p_order_date,
      coalesce(v_item->>'unit_type','bags'),
      nullif(v_item->>'bag_weight_kg','')::numeric,
      v_id,
      p_entered_by
    );

    -- decrement stock for bag-type
    IF (v_item->>'unit_type') = 'bags' THEN
      INSERT INTO product_stock (product_id, location_id, stock_quantity, last_bag_weight_kg)
      VALUES (
        (v_item->>'product_id')::bigint,
        p_location_id,
        -((v_item->>'quantity')::numeric),
        nullif(v_item->>'bag_weight_kg','')::numeric
      )
      ON CONFLICT (product_id, location_id) DO UPDATE
        SET stock_quantity = product_stock.stock_quantity + excluded.stock_quantity,
            last_bag_weight_kg = coalesce(excluded.last_bag_weight_kg, product_stock.last_bag_weight_kg);
    END IF;
  END LOOP;

  -- single cash entry for the whole mix order
  IF p_cash_received > 0 THEN
    INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
    SELECT p_order_date, a.id, 'in', p_cash_received, 'mix_order', v_id,
           'Mix order #' || v_id
    FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;
  END IF;

  RETURN QUERY SELECT v_id;
END;
$$;

-- ============================================================
-- DONE.
-- Verify by running:
--   SELECT proname FROM pg_proc WHERE proname IN
--     ('record_purchase','record_expense','transfer_cash',
--      'correct_cash_balance','create_mix_order');
-- ============================================================
