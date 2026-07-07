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

/**
 * Delete a product. Behaviour:
 *  - If the product has any rows in `sales` or `purchases` (FK restrict),
 *    we soft-delete by setting is_active = false so historical records
 *    remain intact. Returns { soft: true }.
 *  - Otherwise we hard-delete the row (and the product_stock row via
 *    cascade). Returns { soft: false }.
 *  - Also deletes the product_stock row for this product (location_id NULL
 *    stock row) before hard-deleting, so no orphan stock remains when
 *    soft-deleting with no other references — done explicitly to keep
 *    the stock page clean.
 */
export async function deleteProduct(id: number): Promise<{ soft: boolean; hadReferences: boolean }> {
  // Check references in sales + purchases (both have on delete restrict)
  const [{ count: salesCount }, { count: purchasesCount }] = await Promise.all([
    admin.from("sales").select("id", { count: "exact", head: true }).eq("product_id", id),
    admin.from("purchases").select("id", { count: "exact", head: true }).eq("product_id", id),
  ]);

  const hadReferences = !!((salesCount ?? 0) > 0 || (purchasesCount ?? 0) > 0);

  if (hadReferences) {
    // Soft-delete: keep row, mark inactive
    const { error } = await admin.from("products").update({ is_active: false }).eq("id", id);
    if (error) throw error;
    return { soft: true, hadReferences: true };
  }

  // Hard-delete: first remove product_stock rows (location_id nullable,
  // not in cascade chain from products), then delete the product row.
  await admin.from("product_stock").delete().eq("product_id", id);
  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) throw error;
  return { soft: false, hadReferences: false };
}

export async function restoreProduct(id: number): Promise<ProductRow> {
  const { data, error } = await admin.from("products").update({ is_active: true }).eq("id", id).select().single();
  if (error) throw error;
  return data as ProductRow;
}
