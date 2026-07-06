import { create } from "zustand";
import type { CartItem, MixIngredient, AppCustomer } from "@/types";

// ─── Shared API error helper ───
// Call after `!res.ok` to get a user-friendly message with the server detail.
export async function apiError(res: Response, fallback: string): Promise<string> {
  try {
    const json = await res.json();
    return (json.detail || json.error || fallback);
  } catch {
    return fallback;
  }
}

interface CartStore {
  items: CartItem[];
  addItem: (item: CartItem) => void;
  removeItem: (index: number) => void;
  clearCart: () => void;
  getTotal: () => number;
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  addItem: (item) => set((s) => ({ items: [...s.items, item] })),
  removeItem: (index) => set((s) => ({ items: s.items.filter((_, i) => i !== index) })),
  clearCart: () => set({ items: [] }),
  getTotal: () => get().items.reduce((sum, i) => sum + i.amount, 0),
}));

interface MixStore {
  targetWeight: number | null;
  customerName: string;
  customerType: "credit" | "cash";
  orderDate: string;
  locationId: number | null;
  ingredients: MixIngredient[];
  startOrder: (name: string, type: "credit" | "cash", date: string, locId: number, target: number) => void;
  addIngredient: (ing: MixIngredient) => void;
  removeIngredient: (index: number) => void;
  reset: () => void;
  getUsedWeight: () => number;
  getTotalAmount: () => number;
}

export const useMixStore = create<MixStore>((set, get) => ({
  targetWeight: null,
  customerName: "",
  customerType: "credit",
  orderDate: (() => { const d = new Date(); return new Date(d.getTime() + (5 * 60) * 60000).toISOString().split("T")[0]; })(),
  locationId: null,
  ingredients: [],
  startOrder: (name, type, date, locId, target) =>
    set({ targetWeight: target, customerName: name, customerType: type, orderDate: date, locationId: locId, ingredients: [] }),
  addIngredient: (ing) => set((s) => ({ ingredients: [...s.ingredients, ing] })),
  removeIngredient: (index) => set((s) => ({ ingredients: s.ingredients.filter((_, i) => i !== index) })),
  reset: () => set({ targetWeight: null, customerName: "", customerType: "credit", orderDate: (() => { const d = new Date(); return new Date(d.getTime() + (5 * 60) * 60000).toISOString().split("T")[0]; })(), locationId: null, ingredients: [] }),
  getUsedWeight: () => get().ingredients.reduce((sum, i) => sum + i.weight_kg, 0),
  getTotalAmount: () => get().ingredients.reduce((sum, i) => sum + i.amount, 0),
}));

interface AppStore {
  activePage: string;
  setActivePage: (page: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activePage: "about",
  setActivePage: (page) => set({ activePage: page }),
}));

// ─── Master Data Cache ───
// Shared across pages so switching doesn't re-fetch products/locations/etc.

interface CachedData<T> { data: T; fetchedAt: number }
const CACHE_TTL = 60_000; // 60 seconds

interface MasterDataCache {
  products: CachedData<any[]> | null;
  locations: CachedData<any[]> | null;
  customers: CachedData<any[]> | null;
  suppliers: CachedData<any[]> | null;
  stock: CachedData<any[]> | null;
}

const masterCache: MasterDataCache = {
  products: null, locations: null, customers: null, suppliers: null, stock: null,
};

export { masterCache };

function isStale(entry: CachedData<any> | null): boolean {
  return !entry || Date.now() - entry.fetchedAt > CACHE_TTL;
}

export async function fetchCached<T>(
  key: keyof MasterDataCache,
  url: string,
  unwrapKey: string
): Promise<T[]> {
  if (!isStale(masterCache[key])) {
    return masterCache[key]!.data as T[];
  }
  const res = await fetch(url);
  if (!res.ok) {
    // Only return stale cache on network/5xx errors — throw on 401/403 so pages can redirect
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Auth error (${res.status}) fetching ${url}`);
    }
    // For 500 and other errors, return stale cache if available, otherwise throw
    if (masterCache[key]) return masterCache[key]!.data as T[];
    throw new Error(`Failed to fetch ${url} (status ${res.status})`);
  }
  const json = await res.json();
  const arr = json[unwrapKey] ?? [];
  masterCache[key] = { data: arr, fetchedAt: Date.now() };
  return arr as T[];
}

export function invalidateCache(key?: keyof MasterDataCache) {
  if (key) { masterCache[key] = null; return; }
  Object.keys(masterCache).forEach((k) => { masterCache[k as keyof MasterDataCache] = null; });
}

// ─── Customer Auth Store ───

interface CustomerAuthStore {
  customers: AppCustomer[];
  loggedInCustomer: AppCustomer | null;
  setCustomers: (customers: AppCustomer[]) => void;
  addCustomer: (customer: AppCustomer) => void;
  updateCustomer: (id: string, updates: Partial<AppCustomer>) => void;
  deleteCustomer: (id: string) => void;
  loginCustomer: (email: string, password: string) => AppCustomer | null;
  logoutCustomer: () => void;
  isSubscriptionActive: (customer: AppCustomer) => boolean;
}

export const useCustomerAuthStore = create<CustomerAuthStore>((set, get) => ({
  customers: [],
  loggedInCustomer: null,
  setCustomers: (customers) => set({ customers }),
  addCustomer: (customer) => set((s) => ({ customers: [...s.customers, customer] })),
  updateCustomer: (id, updates) =>
    set((s) => ({
      customers: s.customers.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      loggedInCustomer: s.loggedInCustomer?.id === id ? { ...s.loggedInCustomer, ...updates } : s.loggedInCustomer,
    })),
  deleteCustomer: (id) =>
    set((s) => ({
      customers: s.customers.filter((c) => c.id !== id),
    })),
  loginCustomer: (email, password) => {
    const customer = get().customers.find(
      (c) => c.email === email && c.password === password && c.is_active
    );
    if (customer) {
      set({ loggedInCustomer: customer });
      return customer;
    }
    return null;
  },
  logoutCustomer: () => set({ loggedInCustomer: null }),
  isSubscriptionActive: (customer) => {
    return new Date(customer.subscription_end) > new Date();
  },
}));