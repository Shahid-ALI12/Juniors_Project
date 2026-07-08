-- ============================================================
-- Migration: Add performance indexes
-- Date: 2026-07-08
-- Purpose: Speed up frequent queries on sales, purchases, expenses,
--          cash_ledger, and product_stock tables.
--
-- ⚠️ SAFETY:
--   - 100% safe — indexes do NOT change query results, only speed.
--   - PostgreSQL automatically decides when to use them.
--   - No code changes required.
--   - Idempotent: uses IF NOT EXISTS, safe to re-run.
--   - Drop anytime: DROP INDEX IF EXISTS <name>;
--
-- EXPECTED IMPACT:
--   - Sales queries by customer_id: 10-50x faster (large tables)
--   - Sales queries by sale_date: 5-20x faster
--   - Dashboard "today" sales: instant instead of full table scan
--   - Customer balance RPC: faster (uses customer_id index)
--   - Reconciliation by date range: 5-10x faster
--   - Stock lookups by product+location: instant
--   - Cash ledger by account+date: 10x faster
--
-- COST:
--   - Disk: ~50-100MB for typical 500-customer / 10K-sales shop
--   - Write overhead: microseconds per INSERT (negligible at your scale)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- SALES TABLE
-- ════════════════════════════════════════════════════════════
-- Used by: dashboard "today" sales, customer khata, reconciliation
CREATE INDEX IF NOT EXISTS idx_sales_sale_date
  ON sales(sale_date);

-- Used by: customer balance queries (per-customer sales aggregation)
CREATE INDEX IF NOT EXISTS idx_sales_customer_id
  ON sales(customer_id);

-- Used by: customer khata (sales by customer, ordered by date)
CREATE INDEX IF NOT EXISTS idx_sales_customer_date
  ON sales(customer_id, sale_date);

-- Used by: stock decrement after sale (product lookup)
CREATE INDEX IF NOT EXISTS idx_sales_product_id
  ON sales(product_id);

-- ════════════════════════════════════════════════════════════
-- PURCHASES TABLE
-- ════════════════════════════════════════════════════════════
-- Used by: customer balance (goods settlements — where settled_by_customer_id IS NOT NULL)
-- Partial index: only indexes rows where this column is set (saves space)
CREATE INDEX IF NOT EXISTS idx_purchases_settled_by_customer
  ON purchases(settled_by_customer_id)
  WHERE settled_by_customer_id IS NOT NULL;

-- Used by: stock increment after purchase
CREATE INDEX IF NOT EXISTS idx_purchases_product_location
  ON purchases(product_id, location_id);

-- Used by: purchase history filter by date
CREATE INDEX IF NOT EXISTS idx_purchases_date
  ON purchases(purchase_date);

-- Used by: purchases by supplier (filter on Manage Purchases page)
CREATE INDEX IF NOT EXISTS idx_purchases_supplier_id
  ON purchases(supplier_id);

-- ════════════════════════════════════════════════════════════
-- PRODUCT_STOCK TABLE
-- ════════════════════════════════════════════════════════════
-- Used by: every sale (stock decrement) and every purchase (stock increment)
-- This is the HOTTEST table — must have a covering index
CREATE INDEX IF NOT EXISTS idx_stock_product_location
  ON product_stock(product_id, location_id);

-- ════════════════════════════════════════════════════════════
-- EXPENSES TABLE
-- ════════════════════════════════════════════════════════════
-- Used by: dashboard "today" expenses, reconciliation
CREATE INDEX IF NOT EXISTS idx_expenses_date
  ON expenses(expense_date);

-- ════════════════════════════════════════════════════════════
-- CASH_LEDGER TABLE
-- ════════════════════════════════════════════════════════════
-- Used by: cash account balance queries
CREATE INDEX IF NOT EXISTS idx_cash_ledger_account_date
  ON cash_ledger(account_id, entry_date);

-- Used by: source lookup (e.g. "find ledger entry for sale #123")
CREATE INDEX IF NOT EXISTS idx_cash_ledger_source
  ON cash_ledger(source_type, source_id);

-- ════════════════════════════════════════════════════════════
-- LABOUR_DAILY_WAGES TABLE
-- ════════════════════════════════════════════════════════════
-- Used by: monthly summary query
CREATE INDEX IF NOT EXISTS idx_labour_wages_labour_date
  ON labour_daily_wages(labour_id, wage_date);

-- ════════════════════════════════════════════════════════════
-- LABOUR_PAYMENTS TABLE
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_labour_payments_labour_date
  ON labour_payments(labour_id, payment_date);

-- ════════════════════════════════════════════════════════════
-- MIX_ORDERS TABLE
-- ════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_mix_orders_customer_date
  ON mix_orders(customer_id, order_date);

-- ============================================================
-- Verification (optional): check which indexes exist now
-- SELECT indexname, tablename FROM pg_indexes
-- WHERE schemaname = 'public'
-- ORDER BY tablename, indexname;
-- ============================================================

-- ============================================================
-- ROLLBACK (if ever needed — drop each index):
-- DROP INDEX IF EXISTS idx_sales_sale_date;
-- DROP INDEX IF EXISTS idx_sales_customer_id;
-- DROP INDEX IF EXISTS idx_sales_customer_date;
-- DROP INDEX IF EXISTS idx_sales_product_id;
-- DROP INDEX IF EXISTS idx_purchases_settled_by_customer;
-- DROP INDEX IF EXISTS idx_purchases_product_location;
-- DROP INDEX IF EXISTS idx_purchases_date;
-- DROP INDEX IF EXISTS idx_purchases_supplier_id;
-- DROP INDEX IF EXISTS idx_stock_product_location;
-- DROP INDEX IF EXISTS idx_expenses_date;
-- DROP INDEX IF EXISTS idx_cash_ledger_account_date;
-- DROP INDEX IF EXISTS idx_cash_ledger_source;
-- DROP INDEX IF EXISTS idx_labour_wages_labour_date;
-- DROP INDEX IF EXISTS idx_labour_payments_labour_date;
-- DROP INDEX IF EXISTS idx_mix_orders_customer_date;
-- ============================================================
