import { create } from "zustand";
import type { CartItem, MixIngredient } from "@/types";

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
  orderDate: new Date().toISOString().split("T")[0],
  locationId: null,
  ingredients: [],
  startOrder: (name, type, date, locId, target) =>
    set({ targetWeight: target, customerName: name, customerType: type, orderDate: date, locationId: locId, ingredients: [] }),
  addIngredient: (ing) => set((s) => ({ ingredients: [...s.ingredients, ing] })),
  removeIngredient: (index) => set((s) => ({ ingredients: s.ingredients.filter((_, i) => i !== index) })),
  reset: () => set({ targetWeight: null, customerName: "", customerType: "credit", orderDate: new Date().toISOString().split("T")[0], locationId: null, ingredients: [] }),
  getUsedWeight: () => get().ingredients.reduce((sum, i) => sum + i.weight_kg, 0),
  getTotalAmount: () => get().ingredients.reduce((sum, i) => sum + i.amount, 0),
}));

interface AppStore {
  activePage: string;
  setActivePage: (page: string) => void;
}

export const useAppStore = create<AppStore>((set) => ({
  activePage: "dashboard",
  setActivePage: (page) => set({ activePage: page }),
}));