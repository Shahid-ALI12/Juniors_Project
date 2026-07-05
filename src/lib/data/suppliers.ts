import { admin } from "@/lib/supabase/server-admin";

export interface SupplierRow {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
}

export async function getAllSuppliers(activeOnly = false): Promise<SupplierRow[]> {
  let q = admin.from("suppliers").select("*").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as SupplierRow[];
}

export async function createSupplier(row: Omit<SupplierRow, "id" | "created_at">): Promise<SupplierRow> {
  const { data, error } = await admin.from("suppliers").insert(row).select().single();
  if (error) throw error;
  return data as SupplierRow;
}
