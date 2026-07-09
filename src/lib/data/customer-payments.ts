import { admin } from "@/lib/supabase/server-admin";

export interface CustomerPaymentRow {
  id: number;
  customer_id: number;
  payment_date: string;
  amount: number;
  applied_to_opening: number;
  applied_to_advance: number;
  opening_balance_before: number | null;
  opening_balance_after: number | null;
  advance_before: number | null;
  advance_after: number | null;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
  // Joined (optional — only present when API includes it)
  customers?: { id: number; name: string; type: string } | null;
}

/**
 * Fetch customer payments with optional filters + pagination.
 *
 * Filters:
 *   payment_date      — exact match (single date)
 *   payment_date_gte  — start date (inclusive)
 *   payment_date_lte  — end date (inclusive)
 *   customer_id       — filter to a specific customer
 *   customer_name     — case-insensitive substring match on customers.name
 *
 * Pagination:
 *   page     — 1-indexed page number
 *   pageSize — rows per page (clamped to 200)
 *
 * Returns: { rows, total, page, pageSize, totalPages }
 */
export async function getCustomerPaymentsPaginated(filters: {
  payment_date?: string;
  payment_date_gte?: string;
  payment_date_lte?: string;
  customer_id?: number;
  customer_name?: string;
  page: number;
  pageSize: number;
}): Promise<{
  rows: CustomerPaymentRow[];
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

  // Resolve customer_name → list of customer IDs (2-step query, same as sales)
  let extraCustomerIds: number[] | null = null;
  if (rest.customer_name && rest.customer_name.trim()) {
    const { data: matched, error: matchErr } = await admin
      .from("customers")
      .select("id")
      .ilike("name", `%${rest.customer_name.trim()}%`);
    if (matchErr) throw matchErr;
    extraCustomerIds = (matched || []).map((c: any) => c.id);
    if (extraCustomerIds.length === 0) {
      return { rows: [], total: 0, page: safePage, pageSize: safePageSize, totalPages: 1 };
    }
  }

  let q = admin
    .from("customer_payments")
    .select(
      "id, customer_id, payment_date, amount, applied_to_opening, applied_to_advance, opening_balance_before, opening_balance_after, advance_before, advance_after, notes, entered_by, created_at, customers(id,name,type)",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (rest.payment_date) q = q.eq("payment_date", rest.payment_date);
  if (rest.payment_date_gte) q = q.gte("payment_date", rest.payment_date_gte);
  if (rest.payment_date_lte) q = q.lte("payment_date", rest.payment_date_lte);
  if (rest.customer_id) q = q.eq("customer_id", rest.customer_id);
  if (extraCustomerIds) q = q.in("customer_id", extraCustomerIds);

  const { data, error, count } = await q;
  if (error) throw error;
  const total = count ?? 0;
  return {
    rows: (data || []) as unknown as CustomerPaymentRow[],
    total,
    page: safePage,
    pageSize: safePageSize,
    totalPages: Math.max(1, Math.ceil(total / safePageSize)),
  };
}

/**
 * Record a customer payment (incoming money without a sale).
 *
 * Uses the `record_customer_payment` RPC for atomicity:
 *   1. Locks the customer row
 *   2. Computes balance_due = opening + bill - cash - goods - advance
 *   3. credit_offset = min(amount, max(0, balance_due))
 *      → lowers customer.opening_balance
 *   4. remainder = amount - credit_offset
 *      → adds to customer.advance_payment
 *   5. Inserts customer_payments row with full before/after snapshot
 *
 * Falls back to a JS-side equivalent if the RPC is not deployed
 * (e.g. migration not yet run on this database).
 *
 * Returns: the new customer_payments.id
 */
export async function recordCustomerPayment(params: {
  customer_id: number;
  amount: number;
  payment_date: string;
  notes?: string | null;
  entered_by?: string | null;
}): Promise<number> {
  const { customer_id, amount, payment_date, notes, entered_by } = params;

  if (!amount || amount <= 0) {
    throw new Error("Payment amount must be greater than 0");
  }

  // ── Try RPC first (atomic, all math in Postgres) ──
  try {
    const { data, error } = await admin.rpc("record_customer_payment", {
      p_customer_id: customer_id,
      p_amount: amount,
      p_payment_date: payment_date,
      p_notes: notes ?? null,
      p_entered_by: entered_by ?? null,
    });
    if (error) throw error;
    // RPC returns TABLE(id bigint) — extract first row's id
    return Array.isArray(data) ? Number((data as any)[0]?.id) : Number(data);
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (
      msg.includes("does not exist") ||
      msg.includes("Could not find the function") ||
      msg.includes("cannot extract elements from a scalar")
    ) {
      console.warn(
        "record_customer_payment RPC not found — falling back to JS implementation. " +
        "Run supabase/add-customer-advance-payments.sql to enable the atomic path.",
      );
      return recordCustomerPaymentFallback(params);
    }
    throw rpcErr;
  }
}

/**
 * Fallback: pure JS implementation of record_customer_payment.
 * Non-atomic (no row lock, no single-transaction guarantee) but
 * functionally equivalent for low-concurrency deployments.
 *
 * Math:
 *   balance_due = opening + bill - cash - goods - advance
 *   credit_offset = min(amount, max(0, balance_due))
 *   remainder = amount - credit_offset
 *   new_opening = max(0, opening - credit_offset)
 *   new_advance = advance + remainder
 */
async function recordCustomerPaymentFallback(params: {
  customer_id: number;
  amount: number;
  payment_date: string;
  notes?: string | null;
  entered_by?: string | null;
}): Promise<number> {
  const { customer_id, amount, payment_date, notes, entered_by } = params;

  // Lock + fetch the customer row
  const { data: cust, error: custErr } = await admin
    .from("customers")
    .select("id, opening_balance, advance_payment")
    .eq("id", customer_id)
    .maybeSingle();
  if (custErr) throw custErr;
  if (!cust) throw new Error(`Customer ${customer_id} not found`);

  const oldOpening = Number(cust.opening_balance ?? 0);
  const oldAdvance = Number(cust.advance_payment ?? 0);

  // Compute current balance_due
  const { data: sales, error: salesErr } = await admin
    .from("sales")
    .select("quantity, rate_per_bag, rickshaw_fare, cash_received")
    .eq("customer_id", customer_id);
  if (salesErr) throw salesErr;
  const totalBill = (sales || []).reduce(
    (sum, s) => sum + Number(s.quantity) * Number(s.rate_per_bag) + Number(s.rickshaw_fare),
    0,
  );
  const totalCash = (sales || []).reduce((sum, s) => sum + Number(s.cash_received), 0);

  const { data: purchases } = await admin
    .from("purchases")
    .select("quantity, rate_per_bag")
    .eq("settled_by_customer_id", customer_id);
  const goodsValue = (purchases || []).reduce(
    (sum, p) => sum + Number(p.quantity) * Number(p.rate_per_bag),
    0,
  );

  const balanceDue = oldOpening + totalBill - totalCash - goodsValue - oldAdvance;

  const creditOffset = balanceDue > 0 ? Math.min(amount, balanceDue) : 0;
  const remainder = amount - creditOffset;
  const newOpening = Math.max(0, oldOpening - creditOffset);
  const newAdvance = oldAdvance + remainder;

  // Update customer row
  const { error: upErr } = await admin
    .from("customers")
    .update({ opening_balance: newOpening, advance_payment: newAdvance })
    .eq("id", customer_id);
  if (upErr) throw upErr;

  // Insert payment history row
  const { data: inserted, error: insErr } = await admin
    .from("customer_payments")
    .insert({
      customer_id,
      payment_date,
      amount,
      applied_to_opening: creditOffset,
      applied_to_advance: remainder,
      opening_balance_before: oldOpening,
      opening_balance_after: newOpening,
      advance_before: oldAdvance,
      advance_after: newAdvance,
      notes: notes ?? null,
      entered_by: entered_by ?? null,
    })
    .select("id")
    .single();
  if (insErr) throw insErr;

  return Number((inserted as any).id);
}

/**
 * Delete a customer payment.
 * Uses the `delete_customer_payment` RPC for atomic reversal
 * (restores customer.opening_balance and customer.advance_payment).
 * Falls back to JS implementation if RPC not deployed.
 */
export async function deleteCustomerPayment(id: number): Promise<void> {
  try {
    const { error } = await admin.rpc("delete_customer_payment", { p_payment_id: id });
    if (error) throw error;
    return;
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (
      msg.includes("does not exist") ||
      msg.includes("Could not find the function")
    ) {
      console.warn(
        "delete_customer_payment RPC not found — falling back to JS implementation.",
      );
      return deleteCustomerPaymentFallback(id);
    }
    throw rpcErr;
  }
}

async function deleteCustomerPaymentFallback(id: number): Promise<void> {
  const { data: row, error: rowErr } = await admin
    .from("customer_payments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) throw rowErr;
  if (!row) throw new Error(`Customer payment ${id} not found`);

  // Reverse the effect on customer.opening_balance and advance_payment
  const appliedToOpening = Number(row.applied_to_opening ?? 0);
  const appliedToAdvance = Number(row.applied_to_advance ?? 0);

  // Fetch current customer values, then update
  const { data: cust, error: custErr } = await admin
    .from("customers")
    .select("opening_balance, advance_payment")
    .eq("id", row.customer_id)
    .maybeSingle();
  if (custErr) throw custErr;
  if (!cust) throw new Error(`Customer ${row.customer_id} not found`);

  const currOpening = Number(cust.opening_balance ?? 0);
  const currAdvance = Number(cust.advance_payment ?? 0);

  const { error: upErr } = await admin
    .from("customers")
    .update({
      opening_balance: currOpening + appliedToOpening,
      advance_payment: Math.max(0, currAdvance - appliedToAdvance),
    })
    .eq("id", row.customer_id);
  if (upErr) throw upErr;

  const { error: delErr } = await admin
    .from("customer_payments")
    .delete()
    .eq("id", id);
  if (delErr) throw delErr;
}

/**
 * Consume (use) part of a customer's advance_payment during a sale.
 * Calls the `consume_customer_advance` RPC for atomicity.
 *
 * Returns the ACTUAL amount consumed (may be less than requested
 * if the customer has less advance available).
 *
 * No-op (returns 0) if:
 *   - amount <= 0
 *   - RPC not deployed AND fallback encounters an error
 */
export async function consumeCustomerAdvance(
  customerId: number,
  amount: number,
): Promise<number> {
  if (!amount || amount <= 0) return 0;

  try {
    const { data, error } = await admin.rpc("consume_customer_advance", {
      p_customer_id: customerId,
      p_amount: amount,
    });
    if (error) throw error;
    // RPC returns TABLE(consumed numeric)
    return Array.isArray(data) ? Number((data as any)[0]?.consumed ?? 0) : Number(data ?? 0);
  } catch (rpcErr: any) {
    const msg = rpcErr?.message || "";
    if (
      msg.includes("does not exist") ||
      msg.includes("Could not find the function")
    ) {
      console.warn(
        "consume_customer_advance RPC not found — falling back to JS implementation.",
      );
      return consumeCustomerAdvanceFallback(customerId, amount);
    }
    throw rpcErr;
  }
}

async function consumeCustomerAdvanceFallback(
  customerId: number,
  amount: number,
): Promise<number> {
  const { data: cust, error: custErr } = await admin
    .from("customers")
    .select("advance_payment")
    .eq("id", customerId)
    .maybeSingle();
  if (custErr) throw custErr;
  if (!cust) return 0;

  const oldAdvance = Number(cust.advance_payment ?? 0);
  const consume = Math.min(amount, oldAdvance);
  if (consume <= 0) return 0;

  const { error: upErr } = await admin
    .from("customers")
    .update({ advance_payment: Math.max(0, oldAdvance - consume) })
    .eq("id", customerId);
  if (upErr) throw upErr;

  return consume;
}
