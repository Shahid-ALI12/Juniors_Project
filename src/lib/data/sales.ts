import { admin } from "@/lib/supabase/server-admin";

export interface SaleRow {
  id: number;
  customer_id: number;
  product_id: number;
  location_id: number;
  quantity: number;
  rate_per_bag: number;
  rickshaw_fare: number;
  cash_received: number;
  sale_date: string;
  unit_type: string;
  bag_weight_kg: number | null;
  mix_order_id: number | null;
  transaction_group_id: string | null;
  rickshaw_driver_name: string | null;
  entered_by: string | null;
  created_at: string;
  // Joins (optional)
  customers?: { id: number; name: string; type: string } | null;
  products?: { id: number; name: string } | null;
  locations?: { id: number; name: string } | null;
}

export async function getSales(filters?: {
  sale_date?: string;
  sale_date_gte?: string;
  sale_date_lte?: string;
  customer_id?: number;
  transaction_group_id?: string;
  mix_order_id?: number;
}): Promise<SaleRow[]> {
  let q = admin
    .from("sales")
    .select("*, customers(id,name,type), products(id,name), locations(id,name)")
    .order("created_at", { ascending: true });

  if (filters?.sale_date) q = q.eq("sale_date", filters.sale_date);
  if (filters?.sale_date_gte) q = q.gte("sale_date", filters.sale_date_gte);
  if (filters?.sale_date_lte) q = q.lte("sale_date", filters.sale_date_lte);
  if (filters?.customer_id) q = q.eq("customer_id", filters.customer_id);
  if (filters?.transaction_group_id) q = q.eq("transaction_group_id", filters.transaction_group_id);
  if (filters?.mix_order_id) q = q.eq("mix_order_id", filters.mix_order_id);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as SaleRow[];
}

export async function deleteSale(id: number): Promise<void> {
  await admin.from("sales").delete().eq("id", id);
}

export async function deleteSalesByGroup(groupId: string): Promise<void> {
  await admin.from("sales").delete().eq("transaction_group_id", groupId);
}

export async function deleteSalesByMixOrder(mixOrderId: number): Promise<void> {
  await admin.from("sales").delete().eq("mix_order_id", mixOrderId);
}

// Atomic sale creation via RPC
export async function createSaleRPC(params: {
  items: { product_id: number; quantity: number; rate_per_bag: number; unit_type: string; bag_weight_kg: number | null }[];
  customer_id: number;
  location_id: number;
  sale_date: string;
  cash_received: number;
  rickshaw_fare: number;
  rickshaw_driver: string | null;
  transaction_group_id: string;
  entered_by: string | null;
}): Promise<void> {
  try {
    // Try RPC first (atomic: sale rows + stock decrement + cash ledger)
    const { error } = await admin.rpc("create_sale", {
      p_items: JSON.stringify(params.items),
      p_customer_id: params.customer_id,
      p_location_id: params.location_id,
      p_sale_date: params.sale_date,
      p_cash_received: params.cash_received,
      p_rickshaw_fare: params.rickshaw_fare,
      p_rickshaw_driver: params.rickshaw_driver,
      p_transaction_group_id: params.transaction_group_id,
      p_entered_by: params.entered_by,
    });
    if (error) throw error;
  } catch (rpcErr: any) {
    // If RPC function doesn't exist, fall back to direct inserts
    const msg = rpcErr?.message || "";
    if ((msg.includes("does not exist") || msg.includes("Could not find the function")) && msg.includes("function")) {
      console.warn("create_sale RPC not found — falling back to direct insert");
      return createSaleFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: direct inserts without stock decrement or cash ledger (non-atomic)
async function createSaleFallback(params: {
  items: { product_id: number; quantity: number; rate_per_bag: number; unit_type: string; bag_weight_kg: number | null }[];
  customer_id: number;
  location_id: number;
  sale_date: string;
  cash_received: number;
  rickshaw_fare: number;
  rickshaw_driver: string | null;
  transaction_group_id: string;
  entered_by: string | null;
}): Promise<void> {
  // Insert sale rows — put total fare & cash on the first item, 0 on the rest
  const rows = params.items.map((item, idx) => ({
    customer_id: params.customer_id,
    product_id: item.product_id,
    location_id: params.location_id,
    quantity: item.quantity,
    rate_per_bag: item.rate_per_bag,
    rickshaw_fare: idx === 0 ? params.rickshaw_fare : 0,
    cash_received: idx === 0 ? params.cash_received : 0,
    sale_date: params.sale_date,
    unit_type: item.unit_type || "bags",
    bag_weight_kg: item.bag_weight_kg ?? null,
    transaction_group_id: params.transaction_group_id,
    rickshaw_driver_name: params.rickshaw_driver,
    entered_by: params.entered_by,
  }));

  const { error: insertErr } = await admin.from("sales").insert(rows);
  if (insertErr) throw insertErr;

  // Try to insert cash_ledger entry (best effort)
  try {
    if (params.cash_received > 0) {
      const { data: acctData } = await admin
        .from("cash_accounts")
        .select("id")
        .eq("name", "Cash In Hand")
        .limit(1)
        .single();
      if (acctData) {
        await admin.from("cash_ledger").insert({
          entry_date: params.sale_date,
          account_id: (acctData as any).id,
          direction: "in",
          amount: params.cash_received,
          source_type: "sale",
          source_id: null,
          description: "Sale group " + params.transaction_group_id,
          entered_by: params.entered_by,
        });
      }
    }
  } catch (ledgerErr) {
    console.warn("Cash ledger insert failed (non-critical):", ledgerErr);
  }

  // Try to decrement stock (best effort, bags only)
  for (const item of params.items) {
    if (item.unit_type === "bags") {
      try {
        await admin.rpc("decrement_stock_fallback", {
          p_product_id: item.product_id,
          p_location_id: params.location_id,
          p_quantity: item.quantity,
          p_bag_weight_kg: item.bag_weight_kg,
        });
      } catch {
        // Stock decrement is best-effort in fallback mode
        console.warn(`Stock decrement failed for product ${item.product_id} (non-critical)`);
      }
    }
  }
}