import { admin } from "@/lib/supabase/server-admin";

export interface StockRow {
  id: number;
  product_id: number;
  location_id: number;
  stock_quantity: number;
  last_bag_weight_kg: number | null;
  created_at: string;
  products?: { id: number; name: string } | null;
  locations?: { id: number; name: string } | null;
}

export async function getAllStock(): Promise<StockRow[]> {
  const { data, error } = await admin
    .from("product_stock")
    .select("*, products(id,name), locations(id,name)")
    .order("product_id", { ascending: true });
  if (error) throw error;
  return (data || []) as StockRow[];
}

export async function getStockForProduct(product_id: number, location_id: number): Promise<StockRow | null> {
  const { data, error } = await admin
    .from("product_stock")
    .select("*, products(id,name), locations(id,name)")
    .eq("product_id", product_id)
    .eq("location_id", location_id)
    .single();
  if (error) return null;
  return data as StockRow;
}

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
  return data as StockRow;
}
