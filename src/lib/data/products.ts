import { admin } from "@/lib/supabase/server-admin";

export interface ProductRow {
  id: number;
  name: string;
  default_rate: number;
  is_active: boolean;
  created_at: string;
}

export async function getAllProducts(): Promise<ProductRow[]> {
  const { data, error } = await admin.from("products").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as ProductRow[];
}

export async function getProductById(id: number): Promise<ProductRow | null> {
  const { data, error } = await admin.from("products").select("*").eq("id", id).single();
  if (error) return null;
  return data as ProductRow;
}

export async function createProduct(row: Omit<ProductRow, "id" | "created_at">): Promise<ProductRow> {
  const { data, error } = await admin.from("products").insert(row).select().single();
  if (error) throw error;
  return data as ProductRow;
}

export async function updateProduct(id: number, updates: Partial<ProductRow>): Promise<ProductRow> {
  const { data, error } = await admin.from("products").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data as ProductRow;
}
