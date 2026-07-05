import { admin } from "@/lib/supabase/server-admin";

export interface PurchaseRow {
  id: number;
  purchase_date: string;
  product_id: number;
  quantity: number;
  rate_per_bag: number;
  supplier_id: number | null;
  settled_by_customer_id: number | null;
  cash_paid: number;
  location_id: number;
  notes: string | null;
  entered_by: string | null;
  unit_type: string;
  bag_weight_kg: number | null;
  created_at: string;
  // Joins
  products?: { id: number; name: string } | null;
  suppliers?: { id: number; name: string } | null;
  customers?: { id: number; name: string } | null;
  locations?: { id: number; name: string } | null;
}

export async function getPurchases(filters?: {
  purchase_date_gte?: string;
  purchase_date_lte?: string;
}): Promise<PurchaseRow[]> {
  let q = admin
    .from("purchases")
    .select("*, products(id,name), suppliers(id,name), customers(id,name), locations(id,name)")
    .order("created_at", { ascending: false });

  if (filters?.purchase_date_gte) q = q.gte("purchase_date", filters.purchase_date_gte);
  if (filters?.purchase_date_lte) q = q.lte("purchase_date", filters.purchase_date_lte);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as PurchaseRow[];
}

export async function deletePurchase(id: number): Promise<void> {
  await admin.from("purchases").delete().eq("id", id);
}

// Atomic purchase via RPC
export async function recordPurchaseRPC(params: {
  purchase_date: string;
  product_id: number;
  quantity: number;
  rate_per_bag: number;
  supplier_id: number | null;
  settled_by_customer_id: number | null;
  cash_paid: number;
  location_id: number;
  notes: string | null;
  unit_type: string;
  bag_weight_kg: number | null;
  entered_by: string | null;
}): Promise<number> {
  const { data, error } = await admin.rpc("record_purchase", {
    p_purchase_date: params.purchase_date,
    p_product_id: params.product_id,
    p_quantity: params.quantity,
    p_rate_per_bag: params.rate_per_bag,
    p_supplier_id: params.supplier_id,
    p_settled_by_customer_id: params.settled_by_customer_id,
    p_cash_paid: params.cash_paid,
    p_location_id: params.location_id,
    p_notes: params.notes,
    p_unit_type: params.unit_type,
    p_bag_weight_kg: params.bag_weight_kg,
    p_entered_by: params.entered_by,
  });
  if (error) throw error;
  return data as number;
}

// Sum of goods settlements for a customer
export async function getGoodsSettlementsForCustomer(customerId: number): Promise<number> {
  const { data, error } = await admin
    .from("purchases")
    .select("quantity, rate_per_bag")
    .eq("settled_by_customer_id", customerId);
  if (error) throw error;
  return (data || []).reduce((sum, r) => sum + (r.quantity as number) * (r.rate_per_bag as number), 0);
}
