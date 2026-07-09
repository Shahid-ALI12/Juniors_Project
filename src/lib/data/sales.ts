import { admin } from "@/lib/supabase/server-admin";

export interface SaleRow {
  id: number;
  customer_id: number;
  product_id: number;
  location_id: number | null;
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
}

export async function getSales(filters?: {
  sale_date?: string;
  sale_date_gte?: string;
  sale_date_lte?: string;
  customer_id?: number;
  customer_name?: string; // case-insensitive substring match on customers.name
  transaction_group_id?: string;
  mix_order_id?: number;
  location_id?: number;
}): Promise<SaleRow[]> {
  // If customer_name search is requested, first resolve matching customer IDs
  // from the customers table, then filter sales by those IDs (PostgREST
  // doesn't allow direct ilike on a foreign-table column reliably across
  // all setups, so we do a 2-step query for safety).
  let extraCustomerIds: number[] | null = null;
  if (filters?.customer_name && filters.customer_name.trim()) {
    const { data: matched, error: matchErr } = await admin
      .from("customers")
      .select("id")
      .ilike("name", `%${filters.customer_name.trim()}%`);
    if (matchErr) throw matchErr;
    extraCustomerIds = (matched || []).map((c: any) => c.id);
    // If no customer matches, return empty array early (caller shows "no records")
    if (extraCustomerIds.length === 0) return [];
  }

  let q = admin
    .from("sales")
    .select("id, customer_id, product_id, location_id, quantity, rate_per_bag, rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg, mix_order_id, transaction_group_id, rickshaw_driver_name, entered_by, created_at, customers(id,name,type), products(id,name)")
    .order("created_at", { ascending: true });

  if (filters?.sale_date) q = q.eq("sale_date", filters.sale_date);
  if (filters?.sale_date_gte) q = q.gte("sale_date", filters.sale_date_gte);
  if (filters?.sale_date_lte) q = q.lte("sale_date", filters.sale_date_lte);
  if (filters?.customer_id) q = q.eq("customer_id", filters.customer_id);
  if (filters?.transaction_group_id) q = q.eq("transaction_group_id", filters.transaction_group_id);
  if (filters?.mix_order_id) q = q.eq("mix_order_id", filters.mix_order_id);
  if (filters?.location_id !== undefined && filters?.location_id !== null) {
    q = q.eq("location_id", filters.location_id);
  }
  if (extraCustomerIds) {
    q = q.in("customer_id", extraCustomerIds);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as SaleRow[];
}

/**
 * Paginated variant of getSales — for large lists.
 * Returns page metadata alongside the rows.
 *
 * Backward-compat: getSales() above is untouched, so all existing callers
 * (which expect SaleRow[]) continue to work.
 */
export async function getSalesPaginated(filters: {
  sale_date?: string;
  sale_date_gte?: string;
  sale_date_lte?: string;
  customer_id?: number;
  customer_name?: string; // case-insensitive substring match on customers.name
  transaction_group_id?: string;
  mix_order_id?: number;
  location_id?: number;
  page: number;       // 1-indexed
  pageSize: number;   // rows per page
}): Promise<{
  rows: SaleRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { page, pageSize, ...rest } = filters;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200); // cap at 200
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  // Resolve customer_name → list of customer IDs (2-step query)
  let extraCustomerIds: number[] | null = null;
  if (rest.customer_name && rest.customer_name.trim()) {
    const { data: matched, error: matchErr } = await admin
      .from("customers")
      .select("id")
      .ilike("name", `%${rest.customer_name.trim()}%`);
    if (matchErr) throw matchErr;
    extraCustomerIds = (matched || []).map((c: any) => c.id);
    if (extraCustomerIds.length === 0) {
      // No matching customer → return empty page (UI shows "no records for the customer")
      return { rows: [], total: 0, page: safePage, pageSize: safePageSize, totalPages: 1 };
    }
  }

  let q = admin
    .from("sales")
    .select("id, customer_id, product_id, location_id, quantity, rate_per_bag, rickshaw_fare, cash_received, sale_date, unit_type, bag_weight_kg, mix_order_id, transaction_group_id, rickshaw_driver_name, entered_by, created_at, customers(id,name,type), products(id,name)", { count: "exact" })
    .order("created_at", { ascending: true })
    .range(from, to);

  if (rest.sale_date) q = q.eq("sale_date", rest.sale_date);
  if (rest.sale_date_gte) q = q.gte("sale_date", rest.sale_date_gte);
  if (rest.sale_date_lte) q = q.lte("sale_date", rest.sale_date_lte);
  if (rest.customer_id) q = q.eq("customer_id", rest.customer_id);
  if (rest.transaction_group_id) q = q.eq("transaction_group_id", rest.transaction_group_id);
  if (rest.mix_order_id) q = q.eq("mix_order_id", rest.mix_order_id);
  if (rest.location_id !== undefined && rest.location_id !== null) {
    q = q.eq("location_id", rest.location_id);
  }
  if (extraCustomerIds) {
    q = q.in("customer_id", extraCustomerIds);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  const total = count ?? 0;
  return {
    rows: (data || []) as unknown as SaleRow[],
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

export async function deleteSale(id: number): Promise<void> {
  const { error } = await admin.from("sales").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteSalesByGroup(groupId: string): Promise<void> {
  const { error } = await admin.from("sales").delete().eq("transaction_group_id", groupId);
  if (error) throw new Error(error.message);
}

export async function deleteSalesByMixOrder(mixOrderId: number): Promise<void> {
  const { error } = await admin.from("sales").delete().eq("mix_order_id", mixOrderId);
  if (error) throw new Error(error.message);
}

// Atomic sale creation via RPC
export async function createSaleRPC(params: {
  items: { product_id: number; quantity: number; rate_per_bag: number; unit_type: string; bag_weight_kg: number | null }[];
  customer_id: number;
  location_id?: number | null;
  sale_date: string;
  cash_received: number;
  rickshaw_fare: number;
  rickshaw_driver: string | null;
  transaction_group_id: string;
  entered_by: string | null;
}): Promise<void> {
  try {
    // Try RPC first (atomic: sale rows + stock decrement + cash ledger)
    // Pass items as a NATIVE array (supabase-js serializes it correctly).
    // Avoid JSON.stringify — deployed create_sale() functions do
    // `jsonb_typeof(p_items) <> 'array'` which fails if the value arrives
    // as a JSON string scalar instead of a JSON array.
    const { error } = await admin.rpc("create_sale", {
      p_items: params.items as unknown as any,
      p_customer_id: params.customer_id,
      p_location_id: params.location_id ?? null,
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
    if (
      msg.includes("does not exist") ||
      msg.includes("Could not find the function") ||
      msg.includes("cannot extract elements from a scalar") ||
      msg.includes("Items array cannot be empty")
    ) {
      console.warn("create_sale RPC failed — falling back to direct insert. Error:", msg);
      return createSaleFallback(params);
    }
    throw rpcErr;
  }
}

// Fallback: direct inserts without stock decrement or cash ledger (non-atomic)
async function createSaleFallback(params: {
  items: { product_id: number; quantity: number; rate_per_bag: number; unit_type: string; bag_weight_kg: number | null }[];
  customer_id: number;
  location_id?: number | null;
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
    location_id: params.location_id ?? null,
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

  // Always decrement stock at the specified location.
  // Handle both 'bags' and 'kg' units: convert kg → bags using bag_weight_kg.
  const locId = params.location_id ?? 1; // default to Farmhouse if missing
  for (const item of params.items) {
    try {
      const bw = item.bag_weight_kg ?? 50;
      const qtyBags = item.unit_type === "kg"
        ? (bw > 0 ? item.quantity / bw : item.quantity)
        : item.quantity;
      // Upsert stock row at the location
      await admin
        .from("product_stock")
        .upsert(
          {
            product_id: item.product_id,
            location_id: locId,
            stock_quantity: 0,
            last_bag_weight_kg: item.bag_weight_kg ?? null,
          },
          { onConflict: "product_id,location_id" }
        );
      // Decrement (clamped to 0 via RPC)
      await admin.rpc("decrement_stock_fallback", {
        p_product_id: item.product_id,
        p_location_id: locId,
        p_quantity: qtyBags,
      });
    } catch {
      // Stock decrement is best-effort in fallback mode
      console.warn(`Stock decrement failed for product ${item.product_id} (non-critical)`);
    }
  }
}