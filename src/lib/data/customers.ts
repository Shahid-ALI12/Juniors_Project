import { admin } from "@/lib/supabase/server-admin";

export interface CustomerRow {
  id: number;
  name: string;
  type: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export async function getAllCustomers(activeOnly = false): Promise<CustomerRow[]> {
  let q = admin.from("customers").select("*").order("name", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as CustomerRow[];
}

export async function getCustomerById(id: number): Promise<CustomerRow | null> {
  const { data, error } = await admin.from("customers").select("*").eq("id", id).single();
  if (error) return null;
  return data as CustomerRow;
}

export async function createCustomer(row: Omit<CustomerRow, "id" | "created_at">): Promise<CustomerRow> {
  const { data, error } = await admin.from("customers").insert(row).select().single();
  if (error) throw error;
  return data as CustomerRow;
}

export async function updateCustomer(id: number, updates: Partial<CustomerRow>): Promise<CustomerRow> {
  const { data, error } = await admin.from("customers").update(updates).eq("id", id).select().single();
  if (error) throw error;
  return data as CustomerRow;
}

export async function deleteCustomer(id: number): Promise<void> {
  await admin.from("customers").delete().eq("id", id);
}
