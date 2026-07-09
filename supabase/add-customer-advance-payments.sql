-- ============================================================
-- Migration: Customer Advance Payments
-- Date: 2026-07-09
-- Purpose: Add support for "customer payments" — money the
--          customer gives us WITHOUT buying anything.
--
-- Two cases covered:
--   1. Customer has outstanding debt (balance_due > 0):
--      Payment first reduces the debt (we lower opening_balance
--      by min(amount, balance_due), clamped to 0).
--   2. Customer paid MORE than the debt — excess becomes
--      "advance payment" stored on the customer row.
--      If customer has NO debt at all, the FULL amount becomes
--      advance payment.
--
-- The advance payment can later be auto-consumed when the
-- customer buys something (Daily Entry → Complete Sale flow
-- has a "Use advance payment" checkbox).
--
-- ⚠️ This migration is OPTIONAL for the app to keep working.
--   - The TS code has fallback paths if the column / table
--     does not exist (it treats advance_payment as 0 and
--     silently skips the customer_payments history panel).
--   - To activate: run this file ONCE in Supabase SQL Editor.
--   - Safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Add advance_payment column to customers
-- ────────────────────────────────────────────────────────────
alter table customers
  add column if not exists advance_payment numeric(14,2) not null default 0;

comment on column customers.advance_payment is
  'Current advance balance the customer has paid WITHOUT buying anything. '
  'Subtracted from balance_due so the customer effectively gets goods for it later.';

-- ────────────────────────────────────────────────────────────
-- 2. customer_payments table — full history of every payment
--    (incoming money only; advance-consumption during a sale
--     is NOT recorded here — it is reflected in sales.cash_received).
-- ────────────────────────────────────────────────────────────
create table if not exists customer_payments (
  id                       bigint generated always as identity primary key,
  customer_id              bigint not null references customers(id) on delete restrict,
  payment_date             date not null default current_date,
  -- Total amount the customer handed over
  amount                   numeric(14,2) not null check (amount > 0),
  -- How much of `amount` went toward reducing outstanding debt
  -- (we lowered customer.opening_balance by exactly this much)
  applied_to_opening       numeric(14,2) not null default 0 check (applied_to_opening >= 0),
  -- How much of `amount` became advance_payment (excess over debt)
  applied_to_advance       numeric(14,2) not null default 0 check (applied_to_advance >= 0),
  -- Check: applied portions must sum to amount
  constraint customer_payments_split_chk
    check (applied_to_opening + applied_to_advance = amount),
  -- Snapshot of customer.opening_balance just BEFORE this payment
  opening_balance_before   numeric(14,2),
  -- Snapshot of customer.opening_balance just AFTER this payment
  opening_balance_after    numeric(14,2),
  -- Snapshot of customer.advance_payment BEFORE this payment
  advance_before           numeric(14,2),
  -- Snapshot of customer.advance_payment AFTER this payment
  advance_after            numeric(14,2),
  notes                    text,
  entered_by               text,
  created_at               timestamptz not null default now()
);

create index if not exists idx_customer_payments_customer_id
  on customer_payments (customer_id);
create index if not exists idx_customer_payments_payment_date
  on customer_payments (payment_date);
create index if not exists idx_customer_payments_created_at
  on customer_payments (created_at desc);

alter table customer_payments enable row level security;
-- No SELECT/INSERT/UPDATE/DELETE policies for anon/authd on customer_payments
-- → only the service role (used by server API routes) can touch them.

-- ────────────────────────────────────────────────────────────
-- 3. Update get_all_customer_balances() RPC to subtract advance_payment
--    from balance_due.
--    New formula: opening_balance + total_bill - cash_paid - goods_value - advance_payment
--
--    ⚠️ PostgreSQL forbids CREATE OR REPLACE when the OUT params
--    (return type) change. We must DROP the old function first.
--    DROP IF EXISTS makes this safe to re-run.
-- ────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.get_all_customer_balances();

CREATE OR REPLACE FUNCTION public.get_all_customer_balances()
RETURNS TABLE (
  customer_id       bigint,
  opening_balance   numeric,
  total_bill        numeric,
  total_cash_paid   numeric,
  total_goods_value numeric,
  advance_payment   numeric,
  balance_due       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id                                                            AS customer_id,
    COALESCE(c.opening_balance, 0)                                  AS opening_balance,
    COALESCE(s.total_bill, 0)                                       AS total_bill,
    COALESCE(s.total_cash_paid, 0)                                  AS total_cash_paid,
    COALESCE(p.total_goods_value, 0)                                AS total_goods_value,
    COALESCE(c.advance_payment, 0)                                  AS advance_payment,
    COALESCE(c.opening_balance, 0)
      + COALESCE(s.total_bill, 0)
      - COALESCE(s.total_cash_paid, 0)
      - COALESCE(p.total_goods_value, 0)
      - COALESCE(c.advance_payment, 0)                              AS balance_due
  FROM customers c
  LEFT JOIN (
    SELECT
      customer_id,
      SUM(quantity * rate_per_bag + rickshaw_fare) AS total_bill,
      SUM(cash_received)                           AS total_cash_paid
    FROM sales
    GROUP BY customer_id
  ) s ON s.customer_id = c.id
  LEFT JOIN (
    SELECT
      settled_by_customer_id,
      SUM(quantity * rate_per_bag) AS total_goods_value
    FROM purchases
    WHERE settled_by_customer_id IS NOT NULL
    GROUP BY settled_by_customer_id
  ) p ON p.settled_by_customer_id = c.id
  ORDER BY c.id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_customer_balances() TO authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- 4. record_customer_payment() RPC — atomic payment recording
--
--    Logic:
--      1. Compute current balance_due for this customer
--         (= opening_balance + total_bill - cash_paid - goods_value)
--      2. credit_offset = min(p_amount, max(0, balance_due))
--         → reduces customer.opening_balance
--      3. remainder = p_amount - credit_offset
--         → adds to customer.advance_payment
--      4. Update customer row in same transaction
--      5. Insert customer_payments row with full snapshot
-- ────────────────────────────────────────────────────────────
-- ⚠️ Note: RETURNS TABLE(id bigint) declares an OUT column named `id`.
--    Inside the body, ALL references to customer/payment IDs MUST be
--    table-qualified (customers.id, customer_payments.id) to avoid
--    "column reference 'id' is ambiguous" errors — PostgreSQL would
--    otherwise see the OUT param `id` as a candidate.
DROP FUNCTION IF EXISTS public.record_customer_payment(bigint, numeric, date, text, text);

CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_customer_id   bigint,
  p_amount        numeric,
  p_payment_date  date,
  p_notes         text DEFAULT NULL,
  p_entered_by    text DEFAULT NULL
) RETURNS TABLE(id bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cust            customers%ROWTYPE;
  v_total_bill      numeric(14,2);
  v_total_cash      numeric(14,2);
  v_goods_value     numeric(14,2);
  v_balance_due     numeric(14,2);
  v_credit_offset   numeric(14,2);
  v_remainder       numeric(14,2);
  v_new_opening     numeric(14,2);
  v_new_advance     numeric(14,2);
  v_old_opening     numeric(14,2);
  v_old_advance     numeric(14,2);
  v_id              bigint;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than 0';
  END IF;

  -- Lock + fetch the customer row (QUALIFY id to avoid OUT param clash)
  SELECT * INTO v_cust FROM customers WHERE customers.id = p_customer_id FOR UPDATE;
  IF v_cust.id IS NULL THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id;
  END IF;

  v_old_opening := COALESCE(v_cust.opening_balance, 0);
  v_old_advance := COALESCE(v_cust.advance_payment, 0);

  -- Compute current debt (sales aggregation)
  SELECT
    COALESCE(SUM(quantity * rate_per_bag + rickshaw_fare), 0),
    COALESCE(SUM(cash_received), 0)
  INTO v_total_bill, v_total_cash
  FROM sales WHERE sales.customer_id = p_customer_id;

  -- Goods settlements (purchases settled by this customer)
  SELECT COALESCE(SUM(quantity * rate_per_bag), 0)
  INTO v_goods_value
  FROM purchases WHERE purchases.settled_by_customer_id = p_customer_id;

  -- Current balance_due using the OLD (pre-payment) formula:
  --   opening + bill - cash - goods - advance
  -- (advance is already subtracted, so balance_due is net debt)
  v_balance_due := v_old_opening + v_total_bill - v_total_cash - v_goods_value - v_old_advance;

  -- Determine split
  IF v_balance_due > 0 THEN
    v_credit_offset := LEAST(p_amount, v_balance_due);
  ELSE
    v_credit_offset := 0;
  END IF;
  v_remainder := p_amount - v_credit_offset;

  v_new_opening := GREATEST(v_old_opening - v_credit_offset, 0);
  v_new_advance := v_old_advance + v_remainder;

  -- Update customer row (QUALIFY id)
  UPDATE customers
    SET opening_balance = v_new_opening,
        advance_payment = v_new_advance
    WHERE customers.id = p_customer_id;

  -- Insert payment history row
  INSERT INTO customer_payments (
    customer_id, payment_date, amount,
    applied_to_opening, applied_to_advance,
    opening_balance_before, opening_balance_after,
    advance_before, advance_after,
    notes, entered_by
  ) VALUES (
    p_customer_id, p_payment_date, p_amount,
    v_credit_offset, v_remainder,
    v_old_opening, v_new_opening,
    v_old_advance, v_new_advance,
    p_notes, p_entered_by
  )
  RETURNING customer_payments.id INTO v_id;

  RETURN QUERY SELECT v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_customer_payment(bigint,numeric,date,text,text)
  TO authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- 5. delete_customer_payment() RPC — reverse a payment
--    Restores customer.opening_balance and customer.advance_payment
--    to their pre-payment state, then deletes the row.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_customer_payment(
  p_payment_id bigint
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row customer_payments%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM customer_payments WHERE id = p_payment_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Customer payment % not found', p_payment_id;
  END IF;

  -- Reverse the effect on customer.opening_balance
  -- (add back whatever was applied to opening)
  UPDATE customers
    SET opening_balance = COALESCE(opening_balance, 0) + v_row.applied_to_opening,
        advance_payment = GREATEST(COALESCE(advance_payment, 0) - v_row.applied_to_advance, 0)
    WHERE id = v_row.customer_id;

  DELETE FROM customer_payments WHERE id = p_payment_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_customer_payment(bigint)
  TO authenticated, anon;

-- ────────────────────────────────────────────────────────────
-- 6. consume_customer_advance() RPC — used by sale-complete flow
--    when "Use advance payment" checkbox is checked.
--    Decrements customer.advance_payment by min(p_amount, current_advance).
--    Returns the ACTUAL amount consumed (may be less than requested).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_customer_advance(
  p_customer_id bigint,
  p_amount      numeric
) RETURNS TABLE(consumed numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_advance numeric(14,2);
  v_consume     numeric(14,2);
BEGIN
  IF p_amount <= 0 THEN
    RETURN QUERY SELECT 0::numeric;
    RETURN;
  END IF;

  SELECT COALESCE(advance_payment, 0) INTO v_old_advance
    FROM customers WHERE id = p_customer_id FOR UPDATE;

  v_consume := LEAST(p_amount, v_old_advance);

  UPDATE customers
    SET advance_payment = GREATEST(COALESCE(advance_payment, 0) - v_consume, 0)
    WHERE id = p_customer_id;

  RETURN QUERY SELECT v_consume;
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_customer_advance(bigint,numeric)
  TO authenticated, anon;

-- ============================================================
-- Reload PostgREST schema cache so new RPCs are visible
-- ============================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================
-- Verification queries (run manually to sanity-check):
--
-- SELECT id, name, opening_balance, advance_payment FROM customers LIMIT 10;
-- SELECT * FROM customer_payments ORDER BY id DESC LIMIT 10;
-- SELECT * FROM get_all_customer_balances() ORDER BY customer_id LIMIT 10;
-- ============================================================

-- ============================================================
-- Rollback:
--   DROP FUNCTION IF EXISTS public.consume_customer_advance(bigint,numeric);
--   DROP FUNCTION IF EXISTS public.delete_customer_payment(bigint);
--   DROP FUNCTION IF EXISTS public.record_customer_payment(bigint,numeric,date,text,text);
--   DROP TABLE IF EXISTS public.customer_payments;
--   ALTER TABLE customers DROP COLUMN IF EXISTS advance_payment;
-- (also re-create get_all_customer_balances without advance_payment column)
-- ============================================================
