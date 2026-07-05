import { admin } from "@/lib/supabase/server-admin";

export interface MixOrderRow {
  id: number;
  customer_id: number;
  location_id: number;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  created_at: string;
  customers?: { id: number; name: string } | null;
  locations?: { id: number; name: string } | null;
}

export async function getMixOrders(): Promise<MixOrderRow[]> {
  const { data, error } = await admin
    .from("mix_orders")
    .select("*, customers(id,name), locations(id,name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as MixOrderRow[];
}

export async function getMixOrderById(id: number): Promise<MixOrderRow | null> {
  const { data, error } = await admin
    .from("mix_orders")
    .select("*, customers(id,name), locations(id,name)")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as MixOrderRow;
}

export async function createMixOrderRPC(params: {
  customer_id: number;
  location_id: number;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  items: { product_id: number; quantity: number; rate_per_kg: number }[];
}): Promise<number> {
  const { data, error } = await admin.rpc("create_mix_order", {
    p_customer_id: params.customer_id,
    p_location_id: params.location_id,
    p_order_date: params.order_date,
    p_target_weight_kg: params.target_weight_kg,
    p_cash_received: params.cash_received,
    p_entered_by: params.entered_by,
    p_items: JSON.stringify(params.items),
  });
  if (error) throw error;
  return data as number;
}

export async function deleteMixOrder(id: number): Promise<void> {
  await admin.from("mix_orders").delete().eq("id", id);
}
