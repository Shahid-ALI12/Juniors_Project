import { admin } from "@/lib/supabase/server-admin";

export interface StockRow {
  id: number;
  product_id: number;
  location_id: number;
  stock_quantity: number;
  last_bag_weight_kg: number | null;
  created_at: string;
  products?: { id: number; name: string } | null;
}

/**
 * Fetch ALL stock rows (across all locations).
 * Each row is keyed by (product_id, location_id).
 * Use this when you need to display stock for multiple locations at once
 * (e.g. Manage Products page showing Farmhouse + Shop columns).
 */
export async function getAllStock(): Promise<StockRow[]> {
  const { data, error } = await admin
    .from("product_stock")
    .select("id, product_id, location_id, stock_quantity, last_bag_weight_kg, created_at, products(id,name)")
    .order("product_id", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as StockRow[];
}

/**
 * Fetch stock for a specific product at a specific location.
 * Returns null if no stock row exists.
 */
export async function getStockForProduct(
  product_id: number,
  location_id: number
): Promise<StockRow | null> {
  const { data, error } = await admin
    .from("product_stock")
    .select("id, product_id, location_id, stock_quantity, last_bag_weight_kg, created_at, products(id,name)")
    .eq("product_id", product_id)
    .eq("location_id", location_id)
    .maybeSingle();
  if (error) return null;
  return data as unknown as StockRow;
}

/**
 * Fetch all stock rows for a single location.
 * Useful for filtering stock by location on the Manage Products page.
 */
export async function getStockByLocation(location_id: number): Promise<StockRow[]> {
  const { data, error } = await admin
    .from("product_stock")
    .select("id, product_id, location_id, stock_quantity, last_bag_weight_kg, created_at, products(id,name)")
    .eq("location_id", location_id)
    .order("product_id", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as StockRow[];
}

/**
 * Upsert a stock row for a specific (product_id, location_id).
 * If the row already exists, only stock_quantity and last_bag_weight_kg
 * are updated; otherwise a new row is inserted.
 */
export async function upsertStock(params: {
  product_id: number;
  location_id: number;
  stock_quantity: number;
  last_bag_weight_kg: number | null;
}): Promise<StockRow> {
  const { data, error } = await admin
    .from("product_stock")
    .upsert(params, { onConflict: "product_id,location_id" })
    .select()
    .single();
  if (error) throw error;
  return data as unknown as StockRow;
}
