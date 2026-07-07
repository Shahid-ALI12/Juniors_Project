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
  location_id: number | null;
  notes: string | null;
  entered_by: string | null;
  unit_type: string;
  bag_weight_kg: number | null;
  created_at: string;
  // Joins
  products?: { id: number; name: string } | null;
  suppliers?: { id: number; name: string } | null;
  customers?: { id: number; name: string } | null;
}

export async function getPurchases(filters?: {
  purchase_date_gte?: string;
  purchase_date_lte?: string;
}): Promise<PurchaseRow[]> {
  let q = admin
    .from("purchases")
    .select("id, purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, entered_by, unit_type, bag_weight_kg, created_at, products(id,name), suppliers(id,name), customers(id,name)")
    .order("created_at", { ascending: false });

  if (filters?.purchase_date_gte) q = q.gte("purchase_date", filters.purchase_date_gte);
  if (filters?.purchase_date_lte) q = q.lte("purchase_date", filters.purchase_date_lte);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as PurchaseRow[];
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
  location_id?: number | null;
  notes: string | null;
  unit_type: string;
  bag_weight_kg: number | null;
  entered_by: string | null;
}): Promise<number> {
  try {
    // Try RPC first (atomic: purchase + stock increment + cash ledger)
    const { data, error } = await admin.rpc("record_purchase", {
      p_purchase_date: params.purchase_date,
      p_product_id: params.product_id,
      p_quantity: params.quantity,
      p_rate_per_bag: params.rate_per_bag,
      p_supplier_id: params.supplier_id,
      p_settled_by_customer_id: params.settled_by_customer_id,
      p_cash_paid: params.cash_paid,
      p_location_id: params.location_id ?? null,
      p_notes: params.notes,
      p_unit_type: params.unit_type,
      p_bag_weight_kg: params.bag_weight_kg,
      p_entered_by: params.entered_by,
    });
    if (error) throw error;
    // RPC returns TABLE(id bigint) — extract first row's id
    return Array.isArray(data) ? (data as any)[0]?.id as number : data as number;
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (msg.includes("does not exist") || msg.includes("Could not find the function") || msg.includes("cannot extract elements from a scalar")) {
      console.warn("record_purchase RPC not found or scalar error — falling back to direct insert");
      return recordPurchaseFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: direct insert without stock increment or cash ledger (non-atomic)
async function recordPurchaseFallback(params: {
  purchase_date: string;
  product_id: number;
  quantity: number;
  rate_per_bag: number;
  supplier_id: number | null;
  settled_by_customer_id: number | null;
  cash_paid: number;
  location_id?: number | null;
  notes: string | null;
  unit_type: string;
  bag_weight_kg: number | null;
  entered_by: string | null;
}): Promise<number> {
  // Insert purchase
  const { data: purData, error: purErr } = await admin
    .from("purchases")
    .insert({
      purchase_date: params.purchase_date,
      product_id: params.product_id,
      quantity: params.quantity,
      rate_per_bag: params.rate_per_bag,
      supplier_id: params.supplier_id,
      settled_by_customer_id: params.settled_by_customer_id,
      cash_paid: params.cash_paid,
      location_id: params.location_id ?? null,
      notes: params.notes,
      entered_by: params.entered_by,
      unit_type: params.unit_type,
      bag_weight_kg: params.bag_weight_kg,
    })
    .select("id")
    .single();
  if (purErr) throw purErr;
  const purId = (purData as any).id as number;

  // Try to increment stock (best effort, bags only, only if location_id is set)
  if (params.unit_type === "bags" && params.location_id !== null && params.location_id !== undefined) {
    try {
      await admin.from("product_stock").upsert(
        {
          product_id: params.product_id,
          location_id: params.location_id,
          stock_quantity: params.quantity,
          last_bag_weight_kg: params.bag_weight_kg,
        },
        { onConflict: "product_id,location_id" }
      );
    } catch (stockErr) {
      console.warn("Stock upsert failed (non-critical):", stockErr);
    }
  }

  // Try to insert cash_ledger entry (best effort, only if not goods settlement)
  if (!params.settled_by_customer_id && params.cash_paid > 0) {
    try {
      const { data: acctData } = await admin
        .from("cash_accounts")
        .select("id")
        .eq("name", "Cash In Hand")
        .limit(1)
        .single();
      if (acctData) {
        await admin.from("cash_ledger").insert({
          entry_date: params.purchase_date,
          account_id: (acctData as any).id,
          direction: "out",
          amount: params.cash_paid,
          source_type: "purchase",
          source_id: purId,
          description: "Purchase #" + purId,
          entered_by: params.entered_by,
        });
      }
    } catch (ledgerErr) {
      console.warn("Cash ledger insert failed (non-critical):", ledgerErr);
    }
  }

  return purId;
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