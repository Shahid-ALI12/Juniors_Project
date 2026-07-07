#!/usr/bin/env python3
"""Connect to Supabase DB and run ALL required SQL fixes."""
import psycopg2
import sys
import json

DB_HOST = "db.hyylnlgmbujkoadfejjy.supabase.co"
DB_PORT = 5432
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "HCTavmDywwahqfwP"

def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS, sslmode="require"
    )

def run_query(conn, sql, label="Query"):
    """Run a query and return (success, result)."""
    cur = conn.cursor()
    try:
        cur.execute(sql)
        if cur.description:
            cols = [d[0] for d in cur.description]
            rows = cur.fetchall()
            result = [dict(zip(cols, row)) for row in rows]
        else:
            conn.commit()
            result = cur.rowcount
        cur.close()
        print(f"  [OK] {label}")
        return True, result
    except Exception as e:
        conn.rollback()
        cur.close()
        print(f"  [FAIL] {label}: {e}")
        return False, str(e)

def main():
    print("=" * 60)
    print("SUPABASE DATABASE FIX SCRIPT")
    print("=" * 60)

    conn = get_conn()
    print("Connected to Supabase database!\n")

    # ============================================================
    # PHASE 1: DIAGNOSIS
    # ============================================================
    print("=" * 60)
    print("PHASE 1: DIAGNOSIS CHECKS")
    print("=" * 60)

    # Check 1: Existing RPC functions
    print("\n[Check 1] Existing RPC functions:")
    ok, result = run_query(conn, """
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        ORDER BY routine_name;
    """, "RPC functions list")
    if ok:
        existing_rpcs = [r['routine_name'] for r in result]
        print(f"    Found {len(existing_rpcs)} functions: {existing_rpcs}")
    else:
        existing_rpcs = []

    # Check 2: Duplicate suppliers
    print("\n[Check 2] Duplicate suppliers:")
    ok, result = run_query(conn, """
        SELECT lower(name) AS supplier_name, count(*) as cnt
        FROM suppliers
        GROUP BY lower(name)
        HAVING count(*) > 1;
    """, "Duplicate suppliers")
    if ok and result:
        for r in result:
            print(f"    '{r['supplier_name']}' appears {r['cnt']} times")
    elif ok:
        print("    No duplicate suppliers found.")

    # Check 3: Sales vs Ledger mismatch
    print("\n[Check 3] Sales Cash vs Ledger mismatch:")
    ok, result = run_query(conn, """
        SELECT
          (SELECT coalesce(SUM(cash_received), 0) FROM sales) AS sales_cash,
          (SELECT coalesce(SUM(amount), 0) FROM cash_ledger WHERE source_type = 'sale' AND direction = 'in') AS ledger_sale_cash,
          (SELECT coalesce(SUM(cash_received), 0) FROM sales) -
          (SELECT coalesce(SUM(amount), 0) FROM cash_ledger WHERE source_type = 'sale' AND direction = 'in') AS difference;
    """, "Sales vs Ledger")
    if ok:
        for r in result:
            print(f"    Sales table cash: {r['sales_cash']}")
            print(f"    Ledger sale-in: {r['ledger_sale_cash']}")
            print(f"    Difference: {r['difference']}")

    # Check 4: Expenses vs Ledger mismatch
    print("\n[Check 4] Expenses vs Ledger mismatch:")
    ok, result = run_query(conn, """
        SELECT
          (SELECT coalesce(SUM(amount), 0) FROM expenses) AS expenses_total,
          (SELECT coalesce(SUM(amount), 0) FROM cash_ledger WHERE source_type = 'expense' AND direction = 'out') AS ledger_expense_total,
          (SELECT coalesce(SUM(amount), 0) FROM cash_ledger WHERE source_type = 'expense' AND direction = 'out') -
          (SELECT coalesce(SUM(amount), 0) FROM expenses) AS difference;
    """, "Expenses vs Ledger")
    if ok:
        for r in result:
            print(f"    Expenses table total: {r['expenses_total']}")
            print(f"    Ledger expense-out: {r['ledger_expense_total']}")
            print(f"    Difference: {r['difference']}")

    # Check 5: Null source_id in ledger
    print("\n[Check 5] Ledger entries with NULL source_id:")
    ok, result = run_query(conn, """
        SELECT id, entry_date, direction, amount, source_type, description
        FROM cash_ledger
        WHERE source_id IS NULL
        ORDER BY created_at;
    """, "Null source_id ledger entries")
    if ok:
        if result:
            for r in result:
                print(f"    ID={r['id']} | {r['entry_date']} | {r['direction']} | {r['amount']} | {r['source_type']} | {r['description']}")
        else:
            print("    No null source_id entries found.")

    # Check 6: Stock mismatch
    print("\n[Check 6] Stock mismatch:")
    ok, result = run_query(conn, """
        WITH movements AS (
          SELECT product_id, location_id, SUM(quantity) AS qty
          FROM purchases
          WHERE coalesce(unit_type, 'bags') = 'bags'
          GROUP BY product_id, location_id
          UNION ALL
          SELECT product_id, location_id, -SUM(quantity) AS qty
          FROM sales
          WHERE coalesce(unit_type, 'bags') = 'bags'
          GROUP BY product_id, location_id
        ),
        expected AS (
          SELECT product_id, location_id, SUM(qty) AS expected_stock
          FROM movements
          GROUP BY product_id, location_id
        )
        SELECT
          coalesce(e.product_id, ps.product_id) AS product_id,
          coalesce(e.location_id, ps.location_id) AS location_id,
          coalesce(e.expected_stock, 0) AS expected_stock,
          coalesce(ps.stock_quantity, 0) AS current_stock,
          coalesce(ps.stock_quantity, 0) - coalesce(e.expected_stock, 0) AS diff
        FROM expected e
        FULL OUTER JOIN product_stock ps
          ON ps.product_id = e.product_id AND ps.location_id = e.location_id
        WHERE coalesce(ps.stock_quantity, 0) <> coalesce(e.expected_stock, 0);
    """, "Stock mismatch check")
    if ok:
        if result:
            for r in result:
                print(f"    Product {r['product_id']} @ Location {r['location_id']}: expected={r['expected_stock']}, current={r['current_stock']}, diff={r['diff']}")
        else:
            print("    No stock mismatches found.")

    # Check 7: Row counts
    print("\n[Check 7] Table row counts:")
    ok, result = run_query(conn, """
        SELECT tablename, n_live_tup as row_count
        FROM pg_stat_user_tables
        WHERE schemaname = 'public'
        ORDER BY tablename;
    """, "Row counts")
    if ok:
        for r in result:
            print(f"    {r['tablename']}: {r['row_count']} rows")

    # Check 8: Existing columns on key tables
    print("\n[Check 8] Key table columns:")
    for tbl in ['sales', 'purchases', 'expenses', 'mix_orders', 'app_customers', 'cash_ledger']:
        ok2, result2 = run_query(conn, f"""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = '{tbl}' AND table_schema = 'public'
            ORDER BY ordinal_position;
        """, f"{tbl} columns")
        if ok2:
            cols = [r2['column_name'] for r2 in result2]
            print(f"    {tbl}: {', '.join(cols)}")

    # ============================================================
    # PHASE 2: CREATE RPC FUNCTIONS
    # ============================================================
    print("\n" + "=" * 60)
    print("PHASE 2: CREATE RPC FUNCTIONS")
    print("=" * 60)

    rpcs_created = 0

    # RPC 1: verify_customer_login
    print("\n[RPC 1] verify_customer_login:")
    if 'verify_customer_login' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
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
    """, "verify_customer_login")
    if ok: rpcs_created += 1

    # RPC 2: create_sale
    print("\n[RPC 2] create_sale:")
    if 'create_sale' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
        CREATE OR REPLACE FUNCTION create_sale(
          p_items jsonb,
          p_customer_id bigint,
          p_location_id bigint,
          p_sale_date date,
          p_cash_received numeric,
          p_rickshaw_fare numeric,
          p_rickshaw_driver text,
          p_transaction_group_id text,
          p_entered_by text
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
            IF (v_item->>'unit_type') = 'bags' THEN
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
    """, "create_sale")
    if ok: rpcs_created += 1

    # RPC 3: record_purchase
    print("\n[RPC 3] record_purchase:")
    if 'record_purchase' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
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
        ) RETURNS bigint
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
          ) RETURNING id INTO v_id;

          IF p_unit_type = 'bags' THEN
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

          RETURN v_id;
        END;
        $$;
    """, "record_purchase")
    if ok: rpcs_created += 1

    # RPC 4: record_expense
    print("\n[RPC 4] record_expense:")
    if 'record_expense' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
        CREATE OR REPLACE FUNCTION record_expense(
          p_description text, p_amount numeric, p_expense_date date, p_entered_by text
        ) RETURNS bigint
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
        AS $$
        DECLARE v_id bigint;
        BEGIN
          INSERT INTO expenses (description, amount, expense_date, entered_by)
          VALUES (p_description, p_amount, p_expense_date, p_entered_by)
          RETURNING id INTO v_id;

          INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
          SELECT p_expense_date, a.id, 'out', p_amount, 'expense', v_id, p_description
          FROM cash_accounts a WHERE a.name = 'Cash In Hand' LIMIT 1;

          RETURN v_id;
        END;
        $$;
    """, "record_expense")
    if ok: rpcs_created += 1

    # RPC 5: transfer_cash
    print("\n[RPC 5] transfer_cash:")
    if 'transfer_cash' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
        CREATE OR REPLACE FUNCTION transfer_cash(
          p_from_account_id bigint, p_to_account_id bigint, p_amount numeric,
          p_date date, p_notes text, p_entered_by text
        ) RETURNS bigint
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
        AS $$
        DECLARE v_id bigint;
        BEGIN
          IF p_from_account_id = p_to_account_id THEN
            RAISE EXCEPTION 'from_account_id and to_account_id must be different';
          END IF;

          INSERT INTO cash_transfers (transfer_date, from_account_id, to_account_id, amount, notes, entered_by)
          VALUES (p_date, p_from_account_id, p_to_account_id, p_amount, p_notes, p_entered_by)
          RETURNING id INTO v_id;

          INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
          VALUES (p_date, p_from_account_id, 'out', p_amount, 'transfer', v_id, 'Transfer out #' || v_id);

          INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
          VALUES (p_date, p_to_account_id, 'in', p_amount, 'transfer', v_id, 'Transfer in #' || v_id);

          RETURN v_id;
        END;
        $$;
    """, "transfer_cash")
    if ok: rpcs_created += 1

    # RPC 6: correct_cash_balance
    print("\n[RPC 6] correct_cash_balance:")
    if 'correct_cash_balance' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
        CREATE OR REPLACE FUNCTION correct_cash_balance(
          p_account_id bigint, p_target numeric, p_date date, p_entered_by text
        ) RETURNS bigint
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
          IF v_diff = 0 THEN RETURN NULL; END IF;
          v_dir := CASE WHEN v_diff > 0 THEN 'in' ELSE 'out' END;

          INSERT INTO cash_ledger (entry_date, account_id, direction, amount, source_type, source_id, description)
          VALUES (p_date, p_account_id, v_dir, abs(v_diff), 'correction', NULL, 'Manual balance correction')
          RETURNING id INTO v_id;

          RETURN v_id;
        END;
        $$;
    """, "correct_cash_balance")
    if ok: rpcs_created += 1

    # RPC 7: create_mix_order
    print("\n[RPC 7] create_mix_order:")
    if 'create_mix_order' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
        CREATE OR REPLACE FUNCTION create_mix_order(
          p_customer_id bigint,
          p_location_id bigint,
          p_order_date date,
          p_target_weight_kg numeric,
          p_cash_received numeric,
          p_entered_by text,
          p_items jsonb
        ) RETURNS bigint
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
        AS $$
        DECLARE
          v_mix_id bigint;
          v_item jsonb;
        BEGIN
          INSERT INTO mix_orders (customer_id, location_id, order_date, target_weight_kg, cash_received, entered_by)
          VALUES (p_customer_id, p_location_id, p_order_date, p_target_weight_kg, p_cash_received, p_entered_by)
          RETURNING id INTO v_mix_id;

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

          RETURN v_mix_id;
        END;
        $$;
    """, "create_mix_order")
    if ok: rpcs_created += 1

    # RPC 8: decrement_stock_fallback
    print("\n[RPC 8] decrement_stock_fallback:")
    if 'decrement_stock_fallback' in existing_rpcs:
        print("  Already exists, recreating (OR REPLACE)...")
    ok, _ = run_query(conn, """
        CREATE OR REPLACE FUNCTION decrement_stock_fallback(
          p_product_id bigint,
          p_location_id bigint,
          p_quantity numeric
        ) RETURNS void
        LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
        AS $$
        BEGIN
          INSERT INTO product_stock (product_id, location_id, stock_quantity)
          VALUES (p_product_id, p_location_id, 0)
          ON CONFLICT (product_id, location_id) DO NOTHING;

          UPDATE product_stock
          SET stock_quantity = stock_quantity - p_quantity
          WHERE product_id = p_product_id
            AND location_id = p_location_id;
        END;
        $$;
    """, "decrement_stock_fallback")
    if ok: rpcs_created += 1

    print(f"\n>> RPC Functions: {rpcs_created}/8 created/replaced")

    # ============================================================
    # PHASE 3: SCHEMA ADDITIONS
    # ============================================================
    print("\n" + "=" * 60)
    print("PHASE 3: SCHEMA ADDITIONS")
    print("=" * 60)

    # Void columns
    for tbl in ['sales', 'purchases', 'expenses', 'mix_orders']:
        run_query(conn, f"""
            DO $$ BEGIN
              IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = '{tbl}' AND column_name = 'voided_at') THEN
                ALTER TABLE {tbl} ADD COLUMN voided_at timestamptz;
                ALTER TABLE {tbl} ADD COLUMN voided_by text;
                ALTER TABLE {tbl} ADD COLUMN void_reason text;
              END IF;
            END $$;
        """, f"Void columns for {tbl}")

    # linked_customer_id
    run_query(conn, """
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_customers' AND column_name = 'linked_customer_id') THEN
            ALTER TABLE app_customers ADD COLUMN linked_customer_id bigint REFERENCES customers(id) ON DELETE SET NULL;
          END IF;
        END $$;
    """, "linked_customer_id column")

    # Void indexes
    run_query(conn, "CREATE INDEX IF NOT EXISTS idx_sales_voided_at ON sales (voided_at) WHERE voided_at IS NOT NULL;", "Index sales_voided_at")
    run_query(conn, "CREATE INDEX IF NOT EXISTS idx_purchases_voided_at ON purchases (voided_at) WHERE voided_at IS NOT NULL;", "Index purchases_voided_at")
    run_query(conn, "CREATE INDEX IF NOT EXISTS idx_expenses_voided_at ON expenses (voided_at) WHERE voided_at IS NOT NULL;", "Index expenses_voided_at")
    run_query(conn, "CREATE INDEX IF NOT EXISTS idx_mix_orders_voided_at ON mix_orders (voided_at) WHERE voided_at IS NOT NULL;", "Index mix_orders_voided_at")

    # ============================================================
    # PHASE 4: CLEAN DUPLICATE SUPPLIERS
    # ============================================================
    print("\n" + "=" * 60)
    print("PHASE 4: CLEAN DUPLICATE SUPPLIERS")
    print("=" * 60)

    ok, dups = run_query(conn, """
        SELECT lower(name) AS supplier_name, array_agg(id ORDER BY id) AS ids, count(*) as cnt
        FROM suppliers
        GROUP BY lower(name)
        HAVING count(*) > 1;
    """, "Find duplicates")

    if ok and dups:
        for d in dups:
            ids = d['ids']
            keep_id = ids[0]
            remove_ids = ids[1:]
            print(f"\n  Supplier '{d['supplier_name']}' - keep ID {keep_id}, remove IDs {remove_ids}")

            if remove_ids:
                run_query(conn, f"""
                    UPDATE purchases SET supplier_id = {keep_id}
                    WHERE supplier_id IN ({','.join(str(i) for i in remove_ids)});
                """, f"Move purchases to supplier {keep_id}")

                run_query(conn, f"""
                    DELETE FROM suppliers WHERE id IN ({','.join(str(i) for i in remove_ids)});
                """, f"Delete duplicate suppliers {remove_ids}")

        run_query(conn, """
            CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_unique ON suppliers (lower(name));
        """, "Unique index on suppliers")
    elif ok:
        print("  No duplicate suppliers found.")
        run_query(conn, """
            CREATE UNIQUE INDEX IF NOT EXISTS suppliers_name_unique ON suppliers (lower(name));
        """, "Unique index on suppliers (preventive)")

    # ============================================================
    # PHASE 5: RELOAD POSTGREST SCHEMA CACHE
    # ============================================================
    print("\n" + "=" * 60)
    print("PHASE 5: RELOAD POSTGREST SCHEMA CACHE")
    print("=" * 60)

    run_query(conn, "NOTIFY pgrst, 'reload schema';", "Schema cache reload")

    # ============================================================
    # PHASE 6: POST-FIX VERIFICATION
    # ============================================================
    print("\n" + "=" * 60)
    print("PHASE 6: POST-FIX VERIFICATION")
    print("=" * 60)

    # Verify all RPCs
    print("\n[Verify] All RPC functions:")
    ok, result = run_query(conn, """
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        ORDER BY routine_name;
    """, "Final RPC list")
    if ok:
        final_rpcs = [r['routine_name'] for r in result]
        required = ['verify_customer_login', 'create_sale', 'record_purchase',
                     'record_expense', 'transfer_cash', 'correct_cash_balance',
                     'create_mix_order', 'decrement_stock_fallback']
        for req in required:
            status = "[OK]" if req in final_rpcs else "[MISSING]"
            print(f"    {status} {req}")

    # Verify void columns
    print("\n[Verify] Void columns:")
    for tbl in ['sales', 'purchases', 'expenses', 'mix_orders']:
        ok2, result2 = run_query(conn, f"""
            SELECT column_name FROM information_schema.columns
            WHERE table_name = '{tbl}' AND column_name = 'voided_at';
        """, f"{tbl}.voided_at")
        if ok2 and result2:
            print(f"    [OK] {tbl}.voided_at")
        else:
            print(f"    [MISSING] {tbl}.voided_at")

    # Verify linked_customer_id
    ok2, result2 = run_query(conn, """
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'app_customers' AND column_name = 'linked_customer_id';
    """, "app_customers.linked_customer_id")
    if ok2 and result2:
        print("    [OK] app_customers.linked_customer_id")
    else:
        print("    [MISSING] app_customers.linked_customer_id")

    # Verify no duplicate suppliers
    print("\n[Verify] No duplicate suppliers:")
    ok, result = run_query(conn, """
        SELECT lower(name) AS supplier_name, count(*) as cnt
        FROM suppliers
        GROUP BY lower(name)
        HAVING count(*) > 1;
    """, "Final duplicate check")
    if ok and not result:
        print("    [OK] No duplicate suppliers")
    elif ok:
        print(f"    [FAIL] Still {len(result)} duplicates")

    # Final data consistency
    print("\n[Verify] Final data consistency:")
    ok, result = run_query(conn, """
        SELECT
          (SELECT coalesce(SUM(cash_received), 0) FROM sales) AS sales_cash,
          (SELECT coalesce(SUM(amount), 0) FROM cash_ledger WHERE source_type = 'sale' AND direction = 'in') AS ledger_sale_cash;
    """, "Final sales vs ledger")
    if ok:
        for r in result:
            diff = float(r['sales_cash'] or 0) - float(r['ledger_sale_cash'] or 0)
            status = "[OK]" if diff == 0 else f"[MISMATCH diff={diff}]"
            print(f"    {status} Sales={r['sales_cash']} | Ledger={r['ledger_sale_cash']}")

    ok, result = run_query(conn, """
        SELECT
          (SELECT coalesce(SUM(amount), 0) FROM expenses) AS expenses_total,
          (SELECT coalesce(SUM(amount), 0) FROM cash_ledger WHERE source_type = 'expense' AND direction = 'out') AS ledger_expense_total;
    """, "Final expenses vs ledger")
    if ok:
        for r in result:
            diff = float(r['ledger_expense_total'] or 0) - float(r['expenses_total'] or 0)
            status = "[OK]" if diff == 0 else f"[MISMATCH diff={diff}]"
            print(f"    {status} Expenses={r['expenses_total']} | Ledger={r['ledger_expense_total']}")

    conn.close()
    print("\n" + "=" * 60)
    print("ALL DONE!")
    print("=" * 60)

if __name__ == "__main__":
    main()