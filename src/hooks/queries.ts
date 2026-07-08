/**
 * React Query hooks for all data fetching.
 *
 * Why these hooks exist:
 * - Replace useEffect + fetch + setState boilerplate with one line: `const { data } = useX()`
 * - Automatic client-side caching: back-navigation = instant, no refetch
 * - Smart refetch: refetchOnReconnect, manual invalidate via useQueryClient()
 * - Built-in loading/error states
 *
 * Safety:
 * - All hooks return `undefined` while loading and the *expected shape* on success
 * - Pages should use optional chaining: `data?.balances ?? {}`
 * - Initial `placeholderData` keeps old data visible during refetch (no flashing)
 *
 * Cache invalidation on mutations:
 * - After POST/PUT/DELETE, call `queryClient.invalidateQueries({ queryKey: [...] })`
 * - Or use `useQueryClient()` directly in the mutation handler
 */
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

// ─── Types (mirror backend response shapes) ───
interface CashAccount { id: number; name: string; created_at: string; }
interface CashTransfer {
  id: number; transfer_date: string; from_account_id: number; to_account_id: number;
  amount: number; notes: string | null; entered_by: string | null; created_at: string;
  from_account?: CashAccount | null; to_account?: CashAccount | null;
}
interface DashboardMetrics {
  salesTodayCount: number; billedToday: number; cashCollectedToday: number;
  expensesToday: number; totalCustomers: number; totalOutstanding: number;
  overCreditLimitCount: number;
}
interface Reconciliation {
  total_bags_sold: number; total_billed: number; cash_received: number;
  from_credit_customers: number; from_cash_customers: number; total_expenses: number;
  total_cash_in: number; total_cash_out: number; expected_cash_in_hand: number;
  expenses: any[];
}
interface CustomerBalanceInfo {
  opening_balance: number; total_bill: number; total_cash_paid: number;
  total_goods_value: number; balance_due: number;
}

// ─── Query keys (centralized for invalidation) ───
export const queryKeys = {
  cashAccounts: ["cash-accounts"] as const,
  cashBalances: ["cash-balances"] as const,
  cashTransfers: (filters: Record<string, string>) => ["cash-transfers", filters] as const,
  dashboard: ["dashboard"] as const,
  reconciliation: (from: string, to: string) => ["reconciliation", from, to] as const,
  customerBalance: (customerId?: number) => ["customer-balance", customerId] as const,
  customers: (activeOnly: boolean) => ["customers", activeOnly] as const,
  customersPaginated: (filters: Record<string, string>, page: number, pageSize: number) =>
    ["customers", "paged", filters, page, pageSize] as const,
  products: (activeOnly: boolean) => ["products", activeOnly] as const,
  suppliers: (activeOnly: boolean) => ["suppliers", activeOnly] as const,
  stock: ["stock"] as const,
  sales: (filters: Record<string, string | number>) => ["sales", filters] as const,
  purchases: (filters: Record<string, string | number>) => ["purchases", filters] as const,
  expenses: (filters: Record<string, string>) => ["expenses", filters] as const,
  mixOrders: ["mix-orders"] as const,
  mixOrdersPaginated: (filters: Record<string, string>, page: number, pageSize: number) =>
    ["mix-orders", "paged", filters, page, pageSize] as const,
  labours: (activeOnly: boolean) => ["labours", activeOnly] as const,
  labourPayments: (filters: Record<string, unknown>) => ["labour-payments", filters] as const,
};

// ─── Generic fetcher ───
async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any)?.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Cash hooks ───
export function useCashAccounts() {
  return useQuery({
    queryKey: queryKeys.cashAccounts,
    queryFn: () => fetcher<{ accounts: CashAccount[] }>("/api/cash/accounts"),
    staleTime: 60_000, // accounts rarely change
  });
}

export function useCashBalances() {
  return useQuery({
    queryKey: queryKeys.cashBalances,
    queryFn: () => fetcher<{ balances: Record<string, number> }>("/api/cash/balances"),
    staleTime: 5_000,
  });
}

export function useCashTransfers(filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: queryKeys.cashTransfers(filters),
    queryFn: () => fetcher<{ transfers: CashTransfer[] }>(`/api/cash/transfer${qs ? "?" + qs : ""}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

// ─── Reports hooks ───
export function useDashboardMetrics() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: () => fetcher<DashboardMetrics>("/api/reports/dashboard"),
    staleTime: 5_000,
  });
}

export function useReconciliation(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.reconciliation(from, to),
    queryFn: () => fetcher<Reconciliation>(`/api/reports/reconciliation?from=${from}&to=${to}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useCustomerBalance(customerId?: number) {
  return useQuery({
    queryKey: queryKeys.customerBalance(customerId),
    queryFn: () =>
      fetcher<CustomerBalanceInfo | Record<number, CustomerBalanceInfo>>(
        customerId
          ? `/api/reports/customer-balance?customer_id=${customerId}`
          : "/api/reports/customer-balance"
      ),
    staleTime: 10_000,
  });
}

// ─── List hooks ───
export function useCustomers(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.customers(activeOnly),
    queryFn: () => fetcher<{ customers: any[] }>(`/api/customers${activeOnly ? "?active=true" : ""}`),
    staleTime: 30_000,
  });
}

/**
 * Paginated customers hook — for the All-Customers list on customer-khata
 * and manage-customers pages. Supports server-side search (name OR phone ilike).
 *
 * Returns { customers, total, page, pageSize, totalPages }.
 */
export function useCustomersPaginated(
  filters: { activeOnly?: boolean; inactiveOnly?: boolean; search?: string } = {},
  page: number,
  pageSize: number,
) {
  const params: Record<string, string> = {};
  if (filters.activeOnly) params.active = "true";
  if (filters.inactiveOnly) params.inactive = "true";
  if (filters.search && filters.search.trim()) params.search = filters.search.trim();
  params.page = String(page);
  params.pageSize = String(pageSize);
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: queryKeys.customersPaginated(params, page, pageSize),
    queryFn: () =>
      fetcher<{
        customers: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(`/api/customers?${qs}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useProducts(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.products(activeOnly),
    queryFn: () => fetcher<{ products: any[] }>(`/api/products${activeOnly ? "?active=true" : ""}`),
    staleTime: 30_000,
  });
}

export function useSuppliers(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.suppliers(activeOnly),
    queryFn: () => fetcher<{ suppliers: any[] }>(`/api/suppliers${activeOnly ? "?active=true" : ""}`),
    staleTime: 30_000,
  });
}

export function useStock() {
  return useQuery({
    queryKey: queryKeys.stock,
    queryFn: () => fetcher<{ stock: any[] }>("/api/stock"),
    staleTime: 5_000,
  });
}

export function useSales(filters: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(filters as Record<string, string>).toString();
  return useQuery({
    queryKey: queryKeys.sales(filters),
    queryFn: () => fetcher<{ sales: any[] }>(`/api/sales${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Paginated sales hook — for large sales lists (e.g. customer khata history).
 * Returns { sales, total, page, pageSize, totalPages }.
 * Uses placeholderData: keepPreviousData so UI doesn't flash empty during page change.
 */
export function useSalesPaginated(
  filters: Record<string, string | number> = {},
  page: number,
  pageSize: number,
) {
  const params = new URLSearchParams(filters as Record<string, string>);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const qs = params.toString();
  return useQuery({
    queryKey: [...queryKeys.sales(filters), "paged", page, pageSize],
    queryFn: () =>
      fetcher<{
        sales: any[];
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(`/api/sales?${qs}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function usePurchases(filters: Record<string, string | number> = {}) {
  const qs = new URLSearchParams(filters as Record<string, string>).toString();
  return useQuery({
    queryKey: queryKeys.purchases(filters),
    queryFn: () => fetcher<{ purchases: any[] }>(`/api/purchases${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function useExpenses(filters: Record<string, string> = {}) {
  const qs = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: queryKeys.expenses(filters),
    queryFn: () => fetcher<{ expenses: any[] }>(`/api/expenses${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function useMixOrders() {
  return useQuery({
    queryKey: queryKeys.mixOrders,
    queryFn: () => fetcher<{ orders: any[]; salesByMix: Record<number, any[]> }>("/api/mix-orders"),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

/**
 * Paginated mix-orders hook — for the "Past Mix Orders" list.
 * Supports server-side search by customer name (ilike).
 *
 * Returns { orders, salesByMix, total, page, pageSize, totalPages }.
 */
export function useMixOrdersPaginated(
  filters: { search?: string; location_id?: number } = {},
  page: number,
  pageSize: number,
) {
  const params: Record<string, string> = { page: String(page), pageSize: String(pageSize) };
  if (filters.search && filters.search.trim()) params.search = filters.search.trim();
  if (filters.location_id != null) params.location_id = String(filters.location_id);
  const qs = new URLSearchParams(params).toString();
  return useQuery({
    queryKey: queryKeys.mixOrdersPaginated(params, page, pageSize),
    queryFn: () =>
      fetcher<{
        orders: any[];
        salesByMix: Record<number, any[]>;
        total: number;
        page: number;
        pageSize: number;
        totalPages: number;
      }>(`/api/mix-orders?${qs}`),
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useLabours(activeOnly = false) {
  return useQuery({
    queryKey: queryKeys.labours(activeOnly),
    queryFn: () => fetcher<{ labours: any[] }>(`/api/labours${activeOnly ? "?active=true" : ""}`),
    staleTime: 60_000,
  });
}

export function useLabourPayments(filters: Record<string, unknown> = {}) {
  // Build query string from filter object
  const params = new URLSearchParams();
  if (filters.labour_id != null) params.set("labour_id", String(filters.labour_id));
  if (filters.payment_date) params.set("payment_date", String(filters.payment_date));
  if (filters.payment_date_gte) params.set("from", String(filters.payment_date_gte));
  if (filters.payment_date_lte) params.set("to", String(filters.payment_date_lte));
  if (filters.payment_type) params.set("type", String(filters.payment_type));
  if (filters.includeLabour) params.set("include_labour", "true");
  const qs = params.toString();
  return useQuery({
    queryKey: queryKeys.labourPayments(filters),
    queryFn: () => fetcher<{ payments: any[] }>(`/api/labour-payments${qs ? "?" + qs : ""}`),
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
}

// ─── Invalidation helpers (call after mutations) ───
export function useInvalidateAfterMutation() {
  const qc = useQueryClient();
  return {
    invalidateCash: () => {
      qc.invalidateQueries({ queryKey: ["cash-accounts"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
      qc.invalidateQueries({ queryKey: ["cash-transfers"] });
    },
    invalidateDashboard: () => qc.invalidateQueries({ queryKey: ["dashboard"] }),
    invalidateCustomerBalance: () => qc.invalidateQueries({ queryKey: ["customer-balance"] }),
    invalidateCustomers: () => qc.invalidateQueries({ queryKey: ["customers"] }),
    invalidateProducts: () => qc.invalidateQueries({ queryKey: ["products"] }),
    invalidateStock: () => qc.invalidateQueries({ queryKey: ["stock"] }),
    invalidateSales: () => qc.invalidateQueries({ queryKey: ["sales"] }),
    invalidatePurchases: () => qc.invalidateQueries({ queryKey: ["purchases"] }),
    invalidateExpenses: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
    invalidateReconciliation: () => qc.invalidateQueries({ queryKey: ["reconciliation"] }),
    invalidateMixOrders: () => qc.invalidateQueries({ queryKey: ["mix-orders"] }),
    invalidateLabours: () => qc.invalidateQueries({ queryKey: ["labours"] }),
    invalidateLabourPayments: () => qc.invalidateQueries({ queryKey: ["labour-payments"] }),

    /** Invalidate everything affected by a sale POST/DELETE */
    invalidateAfterSaleMutation: () => {
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
      qc.invalidateQueries({ queryKey: ["mix-orders"] });
    },
    /** Invalidate everything affected by a purchase POST/DELETE */
    invalidateAfterPurchaseMutation: () => {
      qc.invalidateQueries({ queryKey: ["purchases"] });
      qc.invalidateQueries({ queryKey: ["stock"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
    },
    /** Invalidate everything affected by an expense POST/DELETE */
    invalidateAfterExpenseMutation: () => {
      qc.invalidateQueries({ queryKey: ["expenses"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["reconciliation"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
    },
    /** Invalidate everything affected by a customer create/update/delete */
    invalidateAfterCustomerMutation: () => {
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["customer-balance"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    },
  };
}
