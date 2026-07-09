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

export async function getMixOrders(filters?: { location_id?: number }): Promise<MixOrderRow[]> {
  let q = admin
    .from("mix_orders")
    .select("id, customer_id, location_id, order_date, target_weight_kg, cash_received, entered_by, driver_name, driver_rent, created_at, customers(id,name)");
  if (filters?.location_id !== undefined && filters?.location_id !== null) {
    q = q.eq("location_id", filters.location_id);
  }
  q = q.order("created_at", { ascending: false });
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as unknown as MixOrderRow[];
}

/**
 * Paginated variant of getMixOrders — for large mix-order lists.
 * Returns page metadata alongside the rows.
 *
 * Search: case-insensitive substring match on `customers.name` (ilike).
 * Implemented as a 2-step query (resolve customer IDs first, then filter)
 * because PostgREST doesn't reliably support ilike on a foreign-table column.
 *
 * Backward-compat: getMixOrders() above is untouched.
 */
export async function getMixOrdersPaginated(filters: {
  location_id?: number;
  search?: string;
  page: number;       // 1-indexed
  pageSize: number;   // rows per page
}): Promise<{
  rows: MixOrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const { location_id, search = "", page, pageSize } = filters;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(1, pageSize), 200);
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  // Resolve customer_name → list of customer IDs (2-step query)
  let extraCustomerIds: number[] | null = null;
  const trimmed = search.trim();
  if (trimmed) {
    const { data: matched, error: matchErr } = await admin
      .from("customers")
      .select("id")
      .ilike("name", `%${trimmed}%`);
    if (matchErr) throw matchErr;
    extraCustomerIds = (matched || []).map((c: any) => c.id);
    if (extraCustomerIds.length === 0) {
      return { rows: [], total: 0, page: safePage, pageSize: safePageSize, totalPages: 1 };
    }
  }

  let q = admin
    .from("mix_orders")
    .select("id, customer_id, location_id, order_date, target_weight_kg, cash_received, entered_by, driver_name, driver_rent, created_at, customers(id,name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (location_id !== undefined && location_id !== null) {
    q = q.eq("location_id", location_id);
  }
  if (extraCustomerIds) {
    q = q.in("customer_id", extraCustomerIds);
  }

  const { data, error, count } = await q;
  if (error) throw error;
  const total = count ?? 0;
  return {
    rows: (data || []) as unknown as MixOrderRow[],
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
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
    // Pass items as a NATIVE array (supabase-js serializes it correctly).
    // Avoid JSON.stringify — older deployed create_mix_order() functions
    // do `jsonb_typeof(p_items) <> 'array'` which fails if the value arrives
    // as a JSON string scalar instead of a JSON array.
    const { data, error } = await admin.rpc("create_mix_order", {
      p_customer_id: params.customer_id,
      p_location_id: params.location_id ?? 1, // default to Farmhouse
      p_order_date: params.order_date,
      p_target_weight_kg: params.target_weight_kg,
      p_cash_received: params.cash_received,
      p_entered_by: params.entered_by,
      p_items: params.items as unknown as any,
      p_driver_name: params.driver_name ?? null,
      p_driver_rent: params.driver_rent ?? 0,
    });
    if (error) throw error;
    // RPC returns TABLE(id bigint) — extract first row's id.
    // Older deployed versions return void (data === null); in that case
    // we look up the just-created mix_order by customer + date.
    if (Array.isArray(data) && (data as any)[0]?.id != null) {
      return (data as any)[0].id as number;
    }
    if (typeof data === "number") return data as number;
    // Fallback: fetch the latest mix_order for this customer/date.
    const { data: latest, error: latestErr } = await admin
      .from("mix_orders")
      .select("id")
      .eq("customer_id", params.customer_id)
      .eq("order_date", params.order_date)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (latestErr || !latest) {
      // Even if we can't get the id, the order WAS created — return 0 as
      // a sentinel so the caller knows it succeeded (no exception thrown).
      return 0;
    }
    return (latest as any).id as number;
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (
      msg.includes("does not exist") ||
      msg.includes("Could not find the function") ||
      msg.includes("cannot extract elements from a scalar") ||
      msg.includes("Items array cannot be empty")
    ) {
      console.warn("create_mix_order RPC failed — falling back to direct insert. Error:", msg);
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
      location_id: params.location_id ?? 1,
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
    location_id: params.location_id ?? 1,
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
