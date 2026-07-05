import type { Product, Location, Customer, Sale, Expense, CashAccount, Purchase, Supplier } from "@/types";

// ─── Mock Data for Preview ───

export const mockLocations: Location[] = [
  { id: 1, name: "Farm", created_at: "2025-01-01" },
  { id: 2, name: "Shop", created_at: "2025-01-01" },
];

export const mockProducts: Product[] = [
  { id: 1, name: "Wheat Bran (Choker)", default_rate: 2200, is_active: true, created_at: "2025-01-01" },
  { id: 2, name: "Cotton Seed Cake (Khal Banola)", default_rate: 5800, is_active: true, created_at: "2025-01-01" },
  { id: 3, name: "Maize Gluten (Ghalla)", default_rate: 4600, is_active: true, created_at: "2025-01-01" },
  { id: 4, name: "Soya Bean Meal", default_rate: 7200, is_active: true, created_at: "2025-01-01" },
  { id: 5, name: "Canola Meal", default_rate: 5400, is_active: true, created_at: "2025-01-01" },
  { id: 6, name: "Rice Polish", default_rate: 3200, is_active: true, created_at: "2025-01-01" },
  { id: 7, name: "DCP (Dicalcium Phosphate)", default_rate: 12000, is_active: true, created_at: "2025-01-01" },
  { id: 8, name: "Salt (Namak)", default_rate: 800, is_active: true, created_at: "2025-01-01" },
];

export const mockCustomers: Customer[] = [
  { id: 1, name: "Ali Ahmad", type: "credit", phone: "0300-1234567", is_active: true, created_at: "2025-01-15" },
  { id: 2, name: "Bilal Khan", type: "credit", phone: "0321-9876543", is_active: true, created_at: "2025-01-20" },
  { id: 3, name: "Chaudhry Feed Farm", type: "credit", phone: "0333-5551234", is_active: true, created_at: "2025-02-01" },
  { id: 4, name: "Walk-in Customer", type: "cash", phone: null, is_active: true, created_at: "2025-01-01" },
  { id: 5, name: "Tariq Cattle Farm", type: "credit", phone: "0345-1112233", is_active: true, created_at: "2025-02-10" },
  { id: 6, name: "Rashid & Sons", type: "credit", phone: "0301-4455667", is_active: true, created_at: "2025-03-01" },
];

export const mockSuppliers: Supplier[] = [
  { id: 1, name: "Haji Gulzar Traders", is_active: true, created_at: "2025-01-01" },
  { id: 2, name: "Malik Oil Mills", is_active: true, created_at: "2025-01-01" },
  { id: 3, name: "Faisalabad Grain Market", is_active: true, created_at: "2025-02-01" },
];

const today = new Date().toISOString().split("T")[0];

export const mockSales: Sale[] = [
  {
    id: 1, customer_id: 1, product_id: 1, quantity: 10, rate_per_bag: 2200, rickshaw_fare: 500,
    cash_received: 0, sale_date: today, location_id: 2, unit_type: "bags", bag_weight_kg: 50,
    mix_order_id: null, transaction_group_id: "g1", rickshaw_driver_name: "Aslam", created_at: "2025-06-01T08:00:00", entered_by: null,
    customers: mockCustomers[0], products: mockProducts[0], locations: mockLocations[1],
  },
  {
    id: 2, customer_id: 1, product_id: 2, quantity: 5, rate_per_bag: 5800, rickshaw_fare: 0,
    cash_received: 0, sale_date: today, location_id: 2, unit_type: "bags", bag_weight_kg: 50,
    mix_order_id: null, transaction_group_id: "g1", rickshaw_driver_name: null, created_at: "2025-06-01T08:01:00", entered_by: null,
    customers: mockCustomers[0], products: mockProducts[1], locations: mockLocations[1],
  },
  {
    id: 3, customer_id: 2, product_id: 3, quantity: 2000, rate_per_bag: 46, rickshaw_fare: 1000,
    cash_received: 50000, sale_date: today, location_id: 2, unit_type: "kg", bag_weight_kg: null,
    mix_order_id: null, transaction_group_id: "g2", rickshaw_driver_name: "Bashir", created_at: "2025-06-01T09:00:00", entered_by: null,
    customers: mockCustomers[1], products: mockProducts[2], locations: mockLocations[1],
  },
  {
    id: 4, customer_id: 4, product_id: 6, quantity: 5, rate_per_bag: 3200, rickshaw_fare: 0,
    cash_received: 16000, sale_date: today, location_id: 2, unit_type: "bags", bag_weight_kg: 50,
    mix_order_id: null, transaction_group_id: "g3", rickshaw_driver_name: null, created_at: "2025-06-01T10:00:00", entered_by: null,
    customers: mockCustomers[3], products: mockProducts[5], locations: mockLocations[1],
  },
  {
    id: 5, customer_id: 3, product_id: 4, quantity: 1000, rate_per_bag: 72, rickshaw_fare: 800,
    cash_received: 0, sale_date: today, location_id: 1, unit_type: "kg", bag_weight_kg: null,
    mix_order_id: null, transaction_group_id: "g4", rickshaw_driver_name: "Akram", created_at: "2025-06-01T11:00:00", entered_by: null,
    customers: mockCustomers[2], products: mockProducts[3], locations: mockLocations[0],
  },
  {
    id: 6, customer_id: 5, product_id: 1, quantity: 15, rate_per_bag: 2200, rickshaw_fare: 600,
    cash_received: 0, sale_date: today, location_id: 2, unit_type: "bags", bag_weight_kg: 50,
    mix_order_id: null, transaction_group_id: "g5", rickshaw_driver_name: null, created_at: "2025-06-01T12:00:00", entered_by: null,
    customers: mockCustomers[4], products: mockProducts[0], locations: mockLocations[1],
  },
  // Mix order example
  {
    id: 7, customer_id: 1, product_id: 1, quantity: 500, rate_per_bag: 44, rickshaw_fare: 0,
    cash_received: 0, sale_date: today, location_id: 2, unit_type: "kg", bag_weight_kg: null,
    mix_order_id: "mix-001", transaction_group_id: null, rickshaw_driver_name: null, created_at: "2025-06-01T14:00:00", entered_by: null,
    customers: mockCustomers[0], products: mockProducts[0], locations: mockLocations[1],
  },
  {
    id: 8, customer_id: 1, product_id: 2, quantity: 300, rate_per_bag: 58, rickshaw_fare: 0,
    cash_received: 0, sale_date: today, location_id: 2, unit_type: "kg", bag_weight_kg: null,
    mix_order_id: "mix-001", transaction_group_id: null, rickshaw_driver_name: null, created_at: "2025-06-01T14:01:00", entered_by: null,
    customers: mockCustomers[0], products: mockProducts[1], locations: mockLocations[1],
  },
  {
    id: 9, customer_id: 1, product_id: 8, quantity: 20, rate_per_bag: 8, rickshaw_fare: 0,
    cash_received: 0, sale_date: today, location_id: 2, unit_type: "kg", bag_weight_kg: null,
    mix_order_id: "mix-001", transaction_group_id: null, rickshaw_driver_name: null, created_at: "2025-06-01T14:02:00", entered_by: null,
    customers: mockCustomers[0], products: mockProducts[7], locations: mockLocations[1],
  },
];

export const mockExpenses: Expense[] = [
  { id: 1, description: "Rickshaw to market", amount: 300, expense_date: today, entered_by: null, created_at: "2025-06-01T08:30:00" },
  { id: 2, description: "Tea & snacks", amount: 250, expense_date: today, entered_by: null, created_at: "2025-06-01T10:00:00" },
  { id: 3, description: "Labour loading/unloading", amount: 2000, expense_date: today, entered_by: null, created_at: "2025-06-01T11:30:00" },
  { id: 4, description: "Phone recharge", amount: 500, expense_date: today, entered_by: null, created_at: "2025-06-01T14:00:00" },
];

export const mockCashAccounts: CashAccount[] = [
  { id: 1, name: "Cash In Hand", created_at: "2025-01-01" },
  { id: 2, name: "Cash In Locker", created_at: "2025-01-01" },
];

export const mockPurchases: Purchase[] = [
  {
    id: 1, purchase_date: today, product_id: 1, quantity: 100, rate_per_bag: 1800,
    supplier_id: 1, settled_by_customer_id: null, cash_paid: 180000, location_id: 1,
    notes: "Weekly order", entered_by: null, unit_type: "bags", bag_weight_kg: 50, created_at: "2025-06-01T07:00:00",
    products: mockProducts[0], suppliers: mockSuppliers[0], customers: null, locations: mockLocations[0],
  },
  {
    id: 2, purchase_date: today, product_id: 2, quantity: 50, rate_per_bag: 5200,
    supplier_id: 2, settled_by_customer_id: null, cash_paid: 260000, location_id: 1,
    notes: null, entered_by: null, unit_type: "bags", bag_weight_kg: 50, created_at: "2025-06-01T07:30:00",
    products: mockProducts[1], suppliers: mockSuppliers[1], customers: null, locations: mockLocations[0],
  },
];

// Product stock: { productId, locationId → bags }
export const mockStock: Record<string, number> = {
  "1-1": 250, "1-2": 85,  // Wheat Bran
  "2-1": 120, "2-2": 40,  // Cotton Seed Cake
  "3-1": 80, "3-2": 25,   // Maize Gluten
  "4-1": 45, "4-2": 12,   // Soya Bean Meal
  "5-1": 60, "5-2": 18,   // Canola Meal
  "6-1": 30, "6-2": 15,   // Rice Polish
  "7-1": 10, "7-2": 5,    // DCP
  "8-1": 20, "8-2": 8,    // Salt
};

export const mockAccountBalances: Record<string, number> = {
  "Cash In Hand": 45000,
  "Cash In Locker": 856500,
};