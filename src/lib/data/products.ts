import { admin } from "@/lib/supabase/server-admin";

export interface ProductRow {
  id: number;
  name: string;
  default_rate: number;
  is_active: boolean;
  created_at: string;
  // Tombstone for permanent UI deletion. NULL = visible in UI.
  deleted_at?: string | null;
}

export async function getAllProducts(): Promise<ProductRow[]> {
  const { data, error } = await admin.from("products").select("*").order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as ProductRow[];
}

/**
 * Returns only products that should appear in dropdowns / sale / purchase
 * flows — i.e. not tombstoned (deleted_at IS NULL).
 * Inactive (is_active=false) products ARE still returned here because the
 * Manage Products page needs to display them; callers that need only
 * truly-active products should additionally filter by is_active.
 */
export async function getActiveProducts(): Promise<ProductRow[]> {
  const { data, error } = await admin
    .from("products")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []) as ProductRow[];
}

export async function getProductById(id: number): Promise<ProductRow | null> {
  const { data, error } = await admin.from("products").select("*").eq("id", id).single();
  if (error) return null;
  return data as ProductRow;
}

export async function createProduct(row: Omit<ProductRow, "id" | "created_at" | "deleted_at">): Promise<ProductRow> {
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
 * Soft-delete (deactivate) a product.
 * - Sets is_active = false but keeps the row visible in Manage Products
 *   (so the user can later Restore or Permanently Delete it).
 * - Always succeeds regardless of sales/purchases references — those
 *   historical records simply become read-only links to a now-inactive
 *   product.
 */
export async function deleteProduct(id: number): Promise<{ soft: boolean; hadReferences: boolean }> {
  const [{ count: salesCount }, { count: purchasesCount }] = await Promise.all([
    admin.from("sales").select("id", { count: "exact", head: true }).eq("product_id", id),
    admin.from("purchases").select("id", { count: "exact", head: true }).eq("product_id", id),
  ]);

  const hadReferences = !!((salesCount ?? 0) > 0 || (purchasesCount ?? 0) > 0);

  if (hadReferences) {
    const { error } = await admin.from("products").update({ is_active: false }).eq("id", id);
    if (error) throw error;
    return { soft: true, hadReferences: true };
  }

  // No references — hard-delete outright (cleanup orphan stock row first)
  await admin.from("product_stock").delete().eq("product_id", id);
  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) throw error;
  return { soft: false, hadReferences: false };
}

/**
 * PERMANENTLY remove a product from the UI without losing historical
 * sales/purchases records.
 *
 * Strategy = tombstone:
 *  - If the product has any sales or purchases referencing it, we MUST
 *    keep the row in the DB (FK is ON DELETE RESTRICT), so we set
 *    deleted_at = now() instead. The product disappears from all
 *    dropdowns and from the Manage Products page, but historical
 *    records keep their product_id link and the product name will
 *    still render on old sale/purchase receipts.
 *  - If there are NO references, we hard-delete the row outright
 *    (along with its orphan product_stock row).
 *
 * Returns { tombstoned: true } when the row was kept but marked deleted,
 * or { tombstoned: false } when the row was actually removed from the DB.
 */
export async function permanentDeleteProduct(id: number): Promise<{ tombstoned: boolean; hadReferences: boolean }> {
  const [{ count: salesCount }, { count: purchasesCount }] = await Promise.all([
    admin.from("sales").select("id", { count: "exact", head: true }).eq("product_id", id),
    admin.from("purchases").select("id", { count: "exact", head: true }).eq("product_id", id),
  ]);

  const hadReferences = !!((salesCount ?? 0) > 0 || (purchasesCount ?? 0) > 0);

  if (hadReferences) {
    // Tombstone: keep the row so FK links survive, but hide from UI.
    const { error } = await admin
      .from("products")
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw error;

    // Also zero out and tombstone any product_stock row so the stock
    // page doesn't show stale stock for a deleted product.
    try {
      await admin.from("product_stock").delete().eq("product_id", id);
    } catch {
      // Best-effort cleanup — non-critical.
    }

    return { tombstoned: true, hadReferences: true };
  }

  // No historical references — safe to physically delete the row.
  await admin.from("product_stock").delete().eq("product_id", id);
  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) throw error;
  return { tombstoned: false, hadReferences: false };
}

export async function restoreProduct(id: number): Promise<ProductRow> {
  // Restore reactivates a soft-deleted (is_active=false) product.
  // It does NOT un-tombstone a permanently deleted product — those
  // are intentionally hidden from the UI forever.
  const { data, error } = await admin
    .from("products")
    .update({ is_active: true })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) throw error;
  return data as ProductRow;
}
