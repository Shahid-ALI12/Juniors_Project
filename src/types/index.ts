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