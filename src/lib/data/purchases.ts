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
  location_id?: number;
}): Promise<PurchaseRow[]> {
  let q = admin
    .from("purchases")
    .select("id, purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, entered_by, unit_type, bag_weight_kg, created_at, products(id,name), suppliers(id,name), customers(id,name)")
    .order("created_at", { ascending: false });

  if (filters?.purchase_date_gte) q = q.gte("purchase_date", filters.purchase_date_gte);
  if (filters?.purchase_date_lte) q = q.lte("purchase_date", filters.purchase_date_lte);
  if (filters?.location_id !== undefined && filters?.location_id !== null) {
    q = q.eq("location_id", filters.location_id);
  }

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

  // Always increment stock at the specified location.
  // Handle both 'bags' and 'kg' units: convert kg → bags using bag_weight_kg.
  // We reuse decrement_stock_fallback with NEGATIVE qty (it clamps via GREATEST,
  // so adding works too: GREATEST(0 + qty, 0) = qty).
  const locId = params.location_id ?? 1; // default to Farmhouse if missing
  try {
    const bw = params.bag_weight_kg ?? 50;
    const qtyBags = params.unit_type === "kg"
      ? (bw > 0 ? params.quantity / bw : params.quantity)
      : params.quantity;

    // Upsert stock row at the location to make sure it exists
    await admin
      .from("product_stock")
      .upsert(
        {
          product_id: params.product_id,
          location_id: locId,
          stock_quantity: 0,
          last_bag_weight_kg: params.bag_weight_kg ?? null,
        },
        { onConflict: "product_id,location_id" }
      );

    // Use the decrement RPC with NEGATIVE qty → effectively increments stock
    await admin.rpc("decrement_stock_fallback", {
      p_product_id: params.product_id,
      p_location_id: locId,
      p_quantity: -qtyBags, // negative = increment
    });
  } catch (stockErr) {
    console.warn("Stock increment failed (non-critical):", stockErr);
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

// ─────────────────────────────────────────────────────────────
// Buy-Product History (purchases FROM customers)
// ─────────────────────────────────────────────────────────────
// A "Buy Product" record is a purchases row where settled_by_customer_id
// IS NOT NULL — i.e., we bought goods from a customer (the customer is
// acting as our supplier) and we owe them money for it.
//
// These records flow into the customer khata as "Paid in Goods" (which
// reduces their balance_due) and also appear individually on the
// Buy Product history panel on the Manage Products page.

export async function getBuyProductHistoryPaginated(filters: {
  purchase_date_gte?: string;
  purchase_date_lte?: string;
  customer_id?: number;
  product_id?: number;
  location_id?: number;
  page: number;       // 1-indexed
  pageSize: number;   // rows per page (clamped to 200)
}): Promise<{
  rows: PurchaseRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { page, pageSize, ...rest } = filters;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let q = admin
    .from("purchases")
    .select(
      "id, purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, entered_by, unit_type, bag_weight_kg, created_at, products(id,name), suppliers(id,name), customers(id,name,type,phone)",
      { count: "exact" },
    )
    .not("settled_by_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (rest.purchase_date_gte) q = q.gte("purchase_date", rest.purchase_date_gte);
  if (rest.purchase_date_lte) q = q.lte("purchase_date", rest.purchase_date_lte);
  if (rest.customer_id) q = q.eq("settled_by_customer_id", rest.customer_id);
  if (rest.product_id) q = q.eq("product_id", rest.product_id);
  if (rest.location_id !== undefined && rest.location_id !== null) {
    q = q.eq("location_id", rest.location_id);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  const total = count ?? 0;
  return {
    rows: (data || []) as unknown as PurchaseRow[],
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

// Fetch all buy-product records for a single customer (no pagination —
// used by Customer Khata to render the full per-customer purchase list).
export async function getBuyProductHistoryForCustomer(
  customerId: number,
): Promise<PurchaseRow[]> {
  const { data, error } = await admin
    .from("purchases")
    .select(
      "id, purchase_date, product_id, quantity, rate_per_bag, supplier_id, settled_by_customer_id, cash_paid, location_id, notes, entered_by, unit_type, bag_weight_kg, created_at, products(id,name), suppliers(id,name), customers(id,name,type,phone)",
    )
    .eq("settled_by_customer_id", customerId)
    .order("purchase_date", { ascending: true });
  if (error) throw error;
  return (data || []) as unknown as PurchaseRow[];
}