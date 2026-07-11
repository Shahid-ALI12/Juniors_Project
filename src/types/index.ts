// ─── Database Tables (matching Supabase schema) ───

export interface CashAccount {
  id: number;
  name: string;
  created_at: string;
}

export interface CashLedger {
  id: number;
  entry_date: string;
  account_id: number;
  direction: "in" | "out";
  amount: number;
  source_type: string;
  source_id: number | null;
  description: string | null;
  entered_by: string | null;
  created_at: string;
}

export interface CashTransfer {
  id: number;
  transfer_date: string;
  from_account_id: number;
  to_account_id: number;
  amount: number;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
}

// NOTE: Locations (Farmhouse / Shop) were re-introduced to support
// per-location stock. Each product can have separate stock quantities
// at each location. Sales/purchases are tagged with a location_id so
// the user can filter by location. Default location id = 1 (Farmhouse).

export interface Location {
  id: number;
  name: string;
  created_at: string;
}

export interface Product {
  id: number;
  name: string;
  default_rate: number;
  is_active: boolean;
  created_at: string;
  // Tombstone for permanent UI deletion. NULL = visible in UI.
  // Set = product removed from all dropdowns / Manage Products page,
  // but the DB row stays so historical sales/purchases keep working.
  deleted_at?: string | null;
}

export interface ProductStock {
  id: number;
  product_id: number;
  location_id: number | null;
  stock_quantity: number;
  last_bag_weight_kg: number | null;
  created_at: string;
  products?: Product;
}

export interface Customer {
  id: number;
  name: string;
  type: "credit" | "cash";
  phone: string | null;
  is_active: boolean;
  created_at: string;
  // One-time previous balance the user enters manually (instead of
  // re-entering all historical sales). Added to total bill on every
  // statement so balance_due = opening_balance + total_bill - cash_paid - goods.
  opening_balance: number;
  // Current advance balance the customer has paid WITHOUT buying anything.
  // Subtracted from balance_due so the customer effectively gets goods for
  // it later (via the "Use advance payment" checkbox on Complete Sale).
  // Defaults to 0 when the migration hasn't been applied yet.
  advance_payment?: number;
  // Tombstone for permanent UI deletion. NULL = visible in UI.
  // Set = customer removed from all dropdowns / Manage Customers page,
  // but the DB row stays so historical sales/purchases keep working.
  deleted_at?: string | null;
}

// ─── Customer Payments (incoming money without a sale) ───
// One row per payment. The record_customer_payment() RPC computes
// applied_to_opening / applied_to_advance atomically.
export interface CustomerPayment {
  id: number;
  customer_id: number;
  payment_date: string;
  amount: number;
  applied_to_opening: number;
  applied_to_advance: number;
  opening_balance_before: number | null;
  opening_balance_after: number | null;
  advance_before: number | null;
  advance_after: number | null;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
  // Joined (optional — only present when API includes it)
  customers?: { id: number; name: string; type: string };
}

export interface Sale {
  id: number;
  customer_id: number;
  product_id: number;
  quantity: number;
  rate_per_bag: number;
  rickshaw_fare: number;
  cash_received: number;
  sale_date: string;
  location_id: number | null;
  entered_by: string | null;
  unit_type: "bags" | "kg";
  bag_weight_kg: number | null;
  mix_order_id: string | null;
  transaction_group_id: string | null;
  rickshaw_driver_name: string | null;
  created_at: string;
  // Joined
  customers?: Customer;
  products?: Product;
}

export interface Expense {
  id: number;
  description: string;
  amount: number;
  expense_date: string;
  entered_by: string | null;
  created_at: string;
}

// ─── Labours Khata ───

export type LabourPaymentType = "salary" | "advance" | "expense";

export interface Labour {
  id: number;
  name: string;
  phone: string | null;
  role: string | null;
  daily_wage: number;
  is_active: boolean;
  created_at: string;
  // Which location this labour works at (Shop / Farmhouse).
  // Nullable so the column can be added to existing tables without
  // breaking historical rows; new inserts default to Shop (id=2).
  location_id: number | null;
  // Joined (optional — only present when API includes it)
  locations?: Location;
}

export interface LabourPayment {
  id: number;
  labour_id: number;
  payment_date: string;
  amount: number;
  payment_type: LabourPaymentType;
  description: string | null;
  entered_by: string | null;
  created_at: string;
  // Joined (optional — only present when API includes it)
  labours?: Labour;
}

/**
 * Per-day wage earning entry (income/credit side).
 * Stored in `labour_daily_wages` table — separate from `labour_payments`
 * (which is the outflow side: salary, advance, expense).
 *
 * Balance due per labour per month =
 *   sum(labour_daily_wages.amount) − sum(labour_payments.amount)
 */
export interface LabourDailyWage {
  id: number;
  labour_id: number;
  wage_date: string;        // YYYY-MM-DD
  amount: number;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
  // Joined (optional — only present when API includes it)
  labours?: Labour;
}

/**
 * Monthly summary for a single labour.
 *
 *   total_earned = sum of all labour_daily_wages.amount in the month
 *   total_paid   = sum of all labour_payments.amount in the month
 *   balance_due  = total_earned − total_paid  (can be negative if overpaid)
 *   status       = "not_paid"  if total_paid === 0
 *                  "paid"      if total_paid > 0 (covers partial + full)
 *
 * The UI shows:
 *   • status "Not Paid" badge when status === "not_paid"
 *   • status "Paid" badge + paid amount + remaining when status === "paid"
 */
export type LabourPaymentStatus = "not_paid" | "paid";

export interface LabourMonthlySummary {
  labour_id: number;
  month: string;            // YYYY-MM
  total_earned: number;
  total_paid: number;
  balance_due: number;
  status: LabourPaymentStatus;
  wage_count: number;       // how many daily-wage entries this month
  payment_count: number;    // how many payment entries this month
}

export interface Supplier {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface Purchase {
  id: number;
  purchase_date: string;
  product_id: number;
  quantity: number;
  rate_per_bag: number;
  supplier_id: number | null;
  settled_by_customer_id: number | null;
  cash_paid: number;
  location_id: number | null;
  notes: string | null;
  entered_by: string | null;
  unit_type: "bags" | "kg";
  bag_weight_kg: number | null;
  created_at: string;
  // Joined
  products?: Product;
  suppliers?: Supplier | null;
  customers?: Customer | null;
}

// ─── Computed / UI Types ───

export interface CustomerBalance {
  opening_balance: number;
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
  // Customer's current advance balance (paid without buying).
  // Subtracted from balance_due. Defaults to 0 when the migration
  // hasn't been applied yet.
  advance_payment?: number;
  balance_due: number;
}

export interface StatementLine {
  date: string;
  type: "sale" | "goods_settlement";
  product: string;
  quantity: number;
  unit_label: string;
  rate: number;
  rickshaw_fare: number;
  charge: number;
  payment: number;
  running_balance: number;
  mix_order_id?: string | null;
  is_mix_order?: boolean;
}

export interface CartItem {
  product: string;
  product_id: number;
  location?: string | null;
  location_id?: number | null;
  quantity: number;
  unit_type: "bags" | "kg";
  bag_weight_kg: number | null;
  rate: number;
  amount: number;
}

export interface MixIngredient {
  product: string;
  product_id: number;
  weight_kg: number;
  rate_per_kg: number;
  amount: number;
  // Optional bag-based fields — if user enters bags + rate_per_bag,
  // a separate "bag amount" is shown alongside the main amount.
  bags?: number | null;
  rate_per_bag?: number | null;
  bag_amount?: number | null;
}

export interface AccountBalance {
  [accountName: string]: number;
}

export const CREDIT_LIMIT = 3_000_000;

export const UTILITY_BILL_TYPES = ["Electricity", "Gas", "Internet", "Water", "Rent", "Labour", "Other"];

// ─── Customer Auth & Subscription ───

export type SubscriptionType = "monthly" | "yearly" | "custom";

export interface AppCustomer {
  id: string;
  name: string;
  email: string;
  password: string;
  subscription_type: SubscriptionType;
  subscription_start: string;
  subscription_end: string;
  is_active: boolean;
  created_at: string;
}

export interface CustomerSession {
  customer: AppCustomer;
  isExpired: boolean;
}

// ─── Database Backup ───

export type BackupFilter = "all" | "today" | "month" | "year" | "custom";

export interface BackupFilters {
  type: BackupFilter;
  from?: string; // YYYY-MM-DD (for custom)
  to?: string;   // YYYY-MM-DD (for custom)
}

// ─── Database Restore ───

/**
 * Restore modes:
 * - "merge"  → UPSERT (overwrite existing rows with backup data)
 * - "append" → skip existing IDs, only insert new rows
 */
export type RestoreMode = "merge" | "append";

export interface MixOrderRow {
  id: number;
  customer_id: number;
  location_id: number | null;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  // New — driver info (order-level, both optional)
  driver_name: string | null;
  driver_rent: number;
  created_at: string;
}

export interface DatabaseBackup {
  version: string;
  exported_at: string;
  exported_by: string;
  filters: {
    type: BackupFilter;
    from: string | null;
    to: string | null;
  };
  schema_version: string;
  data: {
    // Master data (always included — no date filter)
    products: Product[];
    // locations array kept for backward compat with old backup files.
    // New backups will write an empty array here.
    locations: unknown[];
    customers: Customer[];
    suppliers: Supplier[];
    cash_accounts: CashAccount[];
    product_stock: ProductStock[];
    // Labours master (always included so labour_payments + labour_daily_wages
    // FK refs survive restore).
    labours: Labour[];
    // Transactional data (date-filtered)
    sales: Sale[];
    mix_orders: MixOrderRow[];
    purchases: Purchase[];
    expenses: Expense[];
    cash_ledger: CashLedger[];
    cash_transfers: CashTransfer[];
    // Labour transactions (date-filtered)
    labour_payments: LabourPayment[];
    labour_daily_wages: LabourDailyWage[];
  };
  // NOTE: app_customers (login + password hashes) is intentionally EXCLUDED
  // for security. Supabase Auth handles admin accounts separately.
}