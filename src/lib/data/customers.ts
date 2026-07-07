import { admin } from "@/lib/supabase/server-admin";

export interface CustomerRow {
  id: number;
  name: string;
  type: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  // One-time previous balance entered manually by the shopkeeper.
  // Added to total bill on every statement so the customer's true
  // outstanding = opening_balance + total_sales - cash_paid - goods.
  opening_balance: number;
  // Tombstone for permanent UI deletion. NULL = visible in UI.
  deleted_at: string | null;
}

/**
 * Returns all customers NOT tombstoned (deleted_at IS NULL).
 * - activeOnly=true  → only is_active=true rows (used by sale/purchase dropdowns)
 * - activeOnly=false → both active + soft-deleted rows (used by Manage Customers page)
 *
 * Tombstoned rows are NEVER returned here. They are invisible in UI
 * but kept in DB so historical sales/purchases keep working.
 */
export async function getAllCustomers(activeOnly = false): Promise<CustomerRow[]> {
  let q = admin
    .from("customers")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as CustomerRow[];
}

export async function getCustomerById(id: number): Promise<CustomerRow | null> {
  const { data, error } = await admin
    .from("customers")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .single();
  if (error) return null;
  return data as CustomerRow;
}

export async function createCustomer(row: Omit<CustomerRow, "id" | "created_at" | "deleted_at">): Promise<CustomerRow> {
  // Strip deleted_at if caller passed it (let DB default to NULL)
  const { deleted_at: _drop, ...payload } = row as any;
  const { data, error } = await admin
    .from("customers")
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data as CustomerRow;
}

export async function updateCustomer(id: number, updates: Partial<CustomerRow>): Promise<CustomerRow> {
  // Never allow updating a tombstoned row
  const { deleted_at: _drop, ...safeUpdates } = updates as any;
  const { data, error } = await admin
    .from("customers")
    .update(safeUpdates)
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) throw error;
  return data as CustomerRow;
}

/**
 * Soft-delete: set is_active=false. Customer disappears from
 * sale/purchase dropdowns but stays visible on Manage Customers
 * page (so user can restore). Can be restored.
 */
export async function deactivateCustomer(id: number): Promise<CustomerRow> {
  const { data, error } = await admin
    .from("customers")
    .update({ is_active: false })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) throw error;
  return data as CustomerRow;
}

/**
 * Restore a soft-deleted customer (is_active=false → true).
 * Does NOT work for tombstoned customers (deleted_at NOT NULL).
 */
export async function restoreCustomer(id: number): Promise<CustomerRow> {
  const { data, error } = await admin
    .from("customers")
    .update({ is_active: true })
    .eq("id", id)
    .is("deleted_at", null)
    .select()
    .single();
  if (error) throw error;
  return data as CustomerRow;
}

/**
 * Permanent delete (tombstone): sets deleted_at = now() and
 * is_active = false. Customer disappears from ALL UI surfaces
 * but DB row stays (sales.customer_id has on delete restrict).
 * CANNOT be restored — by design.
 */
export async function permanentDeleteCustomer(id: number): Promise<void> {
  const { error } = await admin
    .from("customers")
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq("id", id)
    .is("deleted_at", null);
  if (error) throw error;
}

/**
 * Hard-delete (legacy — only used if no FK references exist).
 * Tries to delete the row. Will fail if sales/purchases/mix_orders
 * reference this customer (FK on delete restrict).
 */
export async function deleteCustomer(id: number): Promise<void> {
  await admin.from("customers").delete().eq("id", id);
}
