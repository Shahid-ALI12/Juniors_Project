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
  try {
    // Try RPC first (atomic: mix_orders row + sale lines + cash ledger)
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
  } catch (rpcErr: any) {
    // If RPC function doesn't exist, fall back to direct inserts
    const msg = rpcErr?.message || "";
    if (msg.includes("does not exist") && msg.includes("function")) {
      console.warn("create_mix_order RPC not found — falling back to direct insert");
      return createMixOrderFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: direct inserts without cash ledger (non-atomic)
async function createMixOrderFallback(params: {
  customer_id: number;
  location_id: number;
  order_date: string;
  target_weight_kg: number | null;
  cash_received: number;
  entered_by: string | null;
  items: { product_id: number; quantity: number; rate_per_kg: number }[];
}): Promise<number> {
  // Insert mix_orders parent
  const { data: mixData, error: mixErr } = await admin
    .from("mix_orders")
    .insert({
      customer_id: params.customer_id,
      location_id: params.location_id,
      order_date: params.order_date,
      target_weight_kg: params.target_weight_kg,
      cash_received: params.cash_received,
      entered_by: params.entered_by,
    })
    .select("id")
    .single();
  if (mixErr) throw mixErr;
  const mixId = (mixData as any).id as number;

  // Insert sale lines for each item
  const saleRows = params.items.map((item) => ({
    customer_id: params.customer_id,
    product_id: item.product_id,
    location_id: params.location_id,
    quantity: item.quantity,
    rate_per_bag: item.rate_per_kg,
    rickshaw_fare: 0,
    cash_received: 0,
    sale_date: params.order_date,
    unit_type: "kg",
    bag_weight_kg: null,
    mix_order_id: mixId,
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
  await admin.from("mix_orders").delete().eq("id", id);
}