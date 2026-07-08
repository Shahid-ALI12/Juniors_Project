-- ============================================================
-- Migration: Update correct_cash_balance() RPC to accept name + reason
-- Date: 2026-07-09
-- Purpose: Manual corrections must record WHO made them and WHY.
--          Both fields are now compulsory at the API/UI layer.
--
-- ⚠️ SAFETY:
--   - Idempotent: uses CREATE OR REPLACE.
--   - Backward compatible: old callers (without name/reason) still work
--     — they'll get NULL in entered_by and 'Manual balance correction'
--     as default description.
--   - TS code passes name + reason; old TS code without these still works.
--   - No data migration needed — existing rows keep their values.
--
-- OUTPUT SCHEMA (cash_ledger row inserted):
--   entry_date    = p_date
--   account_id    = p_account_id
--   direction     = 'in' or 'out' (auto-calculated)
--   amount        = abs(diff)
--   source_type   = 'correction'
--   source_id     = NULL
--   description   = p_reason (or 'Manual balance correction' if NULL)
--   entered_by    = p_name (or NULL if not provided)
-- ============================================================

-- Drop old signature (4 params) and recreate with 6 params
DROP FUNCTION IF EXISTS public.correct_cash_balance(bigint, numeric, date, text);
DROP FUNCTION IF EXISTS public.correct_cash_balance(bigint, numeric, date, text, text, text);

CREATE OR REPLACE FUNCTION public.correct_cash_balance(
  p_account_id bigint,
  p_target     numeric,
  p_date       date,
  p_entered_by text DEFAULT NULL,
  p_name       text DEFAULT NULL,
  p_reason     text DEFAULT NULL
) RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current numeric(14,2);
  v_diff   numeric(14,2);
  v_dir    text;
  v_id     bigint;
  v_desc   text;
  v_by     text;
BEGIN
  -- Calculate current running balance for this account
  SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END), 0)
    INTO v_current
  FROM cash_ledger
  WHERE account_id = p_account_id;

  v_diff := p_target - v_current;
  IF v_diff = 0 THEN
    RETURN NULL;  -- no correction needed
  END IF;
  v_dir := CASE WHEN v_diff > 0 THEN 'in' ELSE 'out' END;

  -- Use name + reason if provided; fall back to defaults otherwise
  v_desc := COALESCE(NULLIF(TRIM(p_reason), ''), 'Manual balance correction');
  v_by   := COALESCE(NULLIF(TRIM(p_name), ''), p_entered_by);

  INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description, entered_by)
  VALUES (p_date, p_account_id, v_dir, ABS(v_diff), 'correction', NULL, v_desc, v_by)
  RETURNING cash_ledger.id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_cash_balance(bigint, numeric, date, text, text, text) TO authenticated, anon;

-- ============================================================
-- Verification (run manually):
--   SELECT * FROM correct_cash_balance(1, 50000, CURRENT_DATE, NULL, 'Shahid', 'Cash was short by Rs.500');
--   SELECT id, entry_date, direction, amount, description, entered_by, created_at
--   FROM cash_ledger WHERE source_type = 'correction' ORDER BY id DESC LIMIT 5;
-- ============================================================

-- ============================================================
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.correct_cash_balance(bigint, numeric, date, text, text, text);
--   -- Recreate old version (4 params) if needed:
--   -- CREATE OR REPLACE FUNCTION public.correct_cash_balance(
--   --   p_account_id bigint, p_target numeric, p_date date, p_entered_by text
--   -- ) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
--   -- DECLARE v_current numeric; v_diff numeric; v_dir text; v_id bigint;
--   -- BEGIN
--   --   SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE -amount END),0)
--   --     INTO v_current FROM cash_ledger WHERE account_id = p_account_id;
--   --   v_diff := p_target - v_current;
--   --   IF v_diff = 0 THEN RETURN NULL; END IF;
--   --   v_dir := CASE WHEN v_diff > 0 THEN 'in' ELSE 'out' END;
--   --   INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
--   --   VALUES (p_date, p_account_id, v_dir, ABS(v_diff), 'correction', NULL, 'Manual balance correction')
--   --   RETURNING cash_ledger.id INTO v_id;
--   --   RETURN v_id;
--   -- END; $$;
-- ============================================================
