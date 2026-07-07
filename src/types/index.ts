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
}

export interface ProductStock {
  id: number;
  product_id: number;
  location_id: number;
  stock_quantity: number;
  last_bag_weight_kg: number | null;
  created_at: string;
  products?: Product;
  locations?: Location;
}

export interface Customer {
  id: number;
  name: string;
  type: "credit" | "cash";
  phone: string | null;
  is_active: boolean;
  created_at: string;
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
  location_id: number;
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
  locations?: Location;
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
  location_id: number;
  notes: string | null;
  entered_by: string | null;
  unit_type: "bags" | "kg";
  bag_weight_kg: number | null;
  created_at: string;
  // Joined
  products?: Product;
  suppliers?: Supplier | null;
  customers?: Customer | null;
  locations?: Location;
}

// ─── Computed / UI Types ───

export interface CustomerBalance {
  total_bill: number;
  total_cash_paid: number;
  total_goods_value: number;
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
  location: string;
  location_id: number;
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
  location_id: number;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
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
    locations: Location[];
    customers: Customer[];
    suppliers: Supplier[];
    cash_accounts: CashAccount[];
    product_stock: ProductStock[];
    // Transactional data (date-filtered)
    sales: Sale[];
    mix_orders: MixOrderRow[];
    purchases: Purchase[];
    expenses: Expense[];
    cash_ledger: CashLedger[];
    cash_transfers: CashTransfer[];
  };
  // NOTE: app_customers (login + password hashes) is intentionally EXCLUDED
  // for security. Supabase Auth handles admin accounts separately.
}