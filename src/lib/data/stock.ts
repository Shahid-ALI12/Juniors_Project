import { admin } from "@/lib/supabase/server-admin";

export interface StockRow {
  id: number;
  product_id: number;
  location_id: number | null;
  stock_quantity: number;
  last_bag_weight_kg: number | null;
  created_at: string;
  products?: { id: number; name: string } | null;
}

export async function getAllStock(): Promise<StockRow[]> {
  const { data, error } = await admin
    .from("product_stock")
    .select("id, product_id, location_id, stock_quantity, last_bag_weight_kg, created_at, products(id,name)")
    .order("product_id", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as StockRow[];
}

export async function getStockForProduct(product_id: number, location_id: number | null): Promise<StockRow | null> {
  let q: any = admin
    .from("product_stock")
    .select("id, product_id, location_id, stock_quantity, last_bag_weight_kg, created_at, products(id,name)")
    .eq("product_id", product_id);
  if (location_id !== null && location_id !== undefined) {
    q = q.eq("location_id", location_id);
  } else {
    q = q.is("location_id", null);
  }
  const { data, error } = await q.single();
  if (error) return null;
  return data as unknown as StockRow;
}

export async function upsertStock(params: {
  product_id: number;
  location_id: number | null;
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
