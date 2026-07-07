import { admin } from "@/lib/supabase/server-admin";

export interface MixOrderRow {
  id: number;
  customer_id: number;
  location_id: number | null;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  driver_name: string | null;
  driver_rent: number;
  created_at: string;
  customers?: { id: number; name: string } | null;
}

export async function getMixOrders(): Promise<MixOrderRow[]> {
  const { data, error } = await admin
    .from("mix_orders")
    .select("id, customer_id, location_id, order_date, target_weight_kg, cash_received, entered_by, driver_name, driver_rent, created_at, customers(id,name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as unknown as MixOrderRow[];
}

export async function getMixOrderById(id: number): Promise<MixOrderRow | null> {
  const { data, error } = await admin
    .from("mix_orders")
    .select("id, customer_id, location_id, order_date, target_weight_kg, cash_received, entered_by, driver_name, driver_rent, created_at, customers(id,name)")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as unknown as MixOrderRow;
}

export async function createMixOrderRPC(params: {
  customer_id: number;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  items: { product_id: number; quantity: number; rate_per_kg: number }[];
  driver_name?: string | null;
  driver_rent?: number;
  location_id?: number | null;
}): Promise<number> {
  try {
    // Try RPC first (atomic: mix_orders row + sale lines + cash ledger)
    const { data, error } = await admin.rpc("create_mix_order", {
      p_customer_id: params.customer_id,
      p_location_id: params.location_id ?? null,
      p_order_date: params.order_date,
      p_target_weight_kg: params.target_weight_kg,
      p_cash_received: params.cash_received,
      p_entered_by: params.entered_by,
      p_items: JSON.stringify(params.items),
      p_driver_name: params.driver_name ?? null,
      p_driver_rent: params.driver_rent ?? 0,
    });
    if (error) throw error;
    // RPC returns TABLE(id bigint) — extract first row's id
    return Array.isArray(data) ? (data as any)[0]?.id as number : data as number;
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (msg.includes("does not exist") || msg.includes("Could not find the function") || msg.includes("cannot extract elements from a scalar")) {
      console.warn("create_mix_order RPC not found or scalar error — falling back to direct insert");
      return createMixOrderFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: direct inserts without cash ledger (non-atomic)
async function createMixOrderFallback(params: {
  customer_id: number;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  items: { product_id: number; quantity: number; rate_per_kg: number }[];
  driver_name?: string | null;
  driver_rent?: number;
  location_id?: number | null;
}): Promise<number> {
  // Insert mix_orders parent
  const { data: mixData, error: mixErr } = await admin
    .from("mix_orders")
    .insert({
      customer_id: params.customer_id,
      location_id: params.location_id ?? null,
      order_date: params.order_date,
      target_weight_kg: params.target_weight_kg,
      cash_received: params.cash_received,
      entered_by: params.entered_by,
      driver_name: params.driver_name ?? null,
      driver_rent: params.driver_rent ?? 0,
    })
    .select("id")
    .single();
  if (mixErr) throw mixErr;
  const mixId = (mixData as any).id as number;

  // Generate a transaction_group_id so daily-entry can group these sale lines
  const groupId = `mix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  // Insert sale lines for each item
  const saleRows = params.items.map((item) => ({
    customer_id: params.customer_id,
    product_id: item.product_id,
    location_id: params.location_id ?? null,
    quantity: item.quantity,
    rate_per_bag: item.rate_per_kg,
    rickshaw_fare: 0,
    cash_received: 0,
    sale_date: params.order_date,
    unit_type: "kg",
    bag_weight_kg: null,
    mix_order_id: mixId,
    transaction_group_id: groupId,
    entered_by: params.entered_by,
  }));

  const { error: salesErr } = await admin.from("sales").insert(saleRows);
  if (salesErr) throw salesErr;

  // Try to insert cash_ledger entry (best effort)
  if (params.cash_received > 0) {
    try {
      const { data: acctData } = await admin
        .from("cash_accounts")
        .select("id")
        .eq("name", "Cash In Hand")
        .limit(1)
        .single();
      if (acctData) {
        await admin.from("cash_ledger").insert({
          entry_date: params.order_date,
          account_id: (acctData as any).id,
          direction: "in",
          amount: params.cash_received,
          source_type: "sale",
          source_id: null,
          description: "Mix order #" + mixId,
          entered_by: params.entered_by,
        });
      }
    } catch (ledgerErr) {
      console.warn("Cash ledger insert failed (non-critical):", ledgerErr);
    }
  }

  return mixId;
}

export async function deleteMixOrder(id: number): Promise<void> {
  const { error } = await admin.from("mix_orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
