import { admin } from "@/lib/supabase/server-admin";
import type { Labour, LabourPayment, LabourPaymentType, Location } from "@/types";

// ────────────────────────────────────────────────────────────
// Labours Khata — server-side data access.
//
// All functions use the service-role `admin` client (bypasses RLS).
// Mirrors the pattern of src/lib/data/expenses.ts.
//
// This module is SELF-CONTAINED — it only touches the new
// `labours` and `labour_payments` tables. It does NOT read or
// write to any existing table (no cash_ledger, no expenses).
//
// NOTE: labours now has a location_id column (FK → locations.id)
// so each labour can be tied to Shop or Farmhouse. Default is
// Shop (id=2) per the client's project-wide default policy.
// ────────────────────────────────────────────────────────────

export interface LabourRow {
  id: number;
  name: string;
  phone: string | null;
  role: string | null;
  daily_wage: number;
  is_active: boolean;
  created_at: string;
  location_id: number | null;
  // Joined (only when includeLocation is true)
  locations?: Location;
}

export interface LabourPaymentRow {
  id: number;
  labour_id: number;
  payment_date: string;
  amount: number;
  payment_type: LabourPaymentType;
  description: string | null;
  entered_by: string | null;
  created_at: string;
}

// ─── Labours ───

export async function getAllLabours(
  activeOnly = false,
  filters?: {
    location_id?: number | null;
    includeLocation?: boolean;
  }
): Promise<LabourRow[]> {
  // Cast to `any` because Supabase's static parser struggles with the
  // optional join string at TS level (runtime works fine).
  let q: any = admin
    .from("labours")
    .select(filters?.includeLocation ? "*, locations(*)" : "*")
    .order("name", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  if (filters?.location_id != null) {
    q = q.eq("location_id", filters.location_id);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LabourRow[];
}

export async function getLabourById(
  id: number,
  includeLocation = false
): Promise<LabourRow | null> {
  let q: any = admin
    .from("labours")
    .select(includeLocation ? "*, locations(*)" : "*")
    .eq("id", id)
    .maybeSingle();
  const { data, error } = await q;
  if (error) throw error;
  return (data as LabourRow) || null;
}

export async function createLabour(input: {
  name: string;
  phone?: string | null;
  role?: string | null;
  daily_wage?: number;
  location_id?: number | null;
}): Promise<LabourRow> {
  const row = {
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    role: input.role?.trim() || null,
    daily_wage: input.daily_wage ?? 0,
    is_active: true,
    // Default to Shop (id=2) at the DB level too, so the row is
    // correct even if the API call omits the field.
    location_id: input.location_id ?? null,
  };
  const { data, error } = await admin
    .from("labours")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as LabourRow;
}

export async function updateLabour(
  id: number,
  updates: Partial<Pick<LabourRow, "name" | "phone" | "role" | "daily_wage" | "is_active" | "location_id">>
): Promise<LabourRow> {
  const { data, error } = await admin
    .from("labours")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as LabourRow;
}

export async function deleteLabour(id: number): Promise<void> {
  // Soft delete — just deactivate. Hard delete would fail anyway
  // because labour_payments has on delete restrict.
  await updateLabour(id, { is_active: false });
}

// ─── Labour Payments ───

export async function getLabourPayments(filters?: {
  labour_id?: number;
  payment_date?: string;
  payment_date_gte?: string;
  payment_date_lte?: string;
  payment_type?: LabourPaymentType;
  includeLabour?: boolean;
  // Filter payments by the labour's location (labours.location_id).
  // Resolved at the query level via the labours join so we don't
  // need a separate round-trip.
  location_id?: number | null;
}): Promise<LabourPaymentRow[]> {
  // Type the query builder as `any` because Supabase's static parser
  // produces `ParserError<...>` for the "*, labours(*)" join string
  // at TS level (runtime works fine — it's only the static types that
  // complain). Casting mid-chain (`x as any .y()`) breaks SWC's parser,
  // so we annotate the variable instead.
  //
  // We always select the labours join when filtering by location_id,
  // because the filter lives on the joined row.
  const needJoin = filters?.includeLabour || filters?.location_id != null;
  let q: any = admin
    .from("labour_payments")
    .select(needJoin ? "*, labours(*)" : "*")
    .order("payment_date", { ascending: false })
    .order("id", { ascending: false });

  if (filters?.labour_id)       q = q.eq("labour_id", filters.labour_id);
  if (filters?.payment_date)    q = q.eq("payment_date", filters.payment_date);
  if (filters?.payment_date_gte) q = q.gte("payment_date", filters.payment_date_gte);
  if (filters?.payment_date_lte) q = q.lte("payment_date", filters.payment_date_lte);
  if (filters?.payment_type)    q = q.eq("payment_type", filters.payment_type);
  if (filters?.location_id != null) {
    // Filter via the joined labours row
    q = q.eq("labours.location_id", filters.location_id);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LabourPaymentRow[];
}

export async function createLabourPayment(input: {
  labour_id: number;
  payment_date: string;
  amount: number;
  payment_type?: LabourPaymentType;
  description?: string | null;
  entered_by?: string | null;
}): Promise<LabourPaymentRow> {
  const row = {
    labour_id: input.labour_id,
    payment_date: input.payment_date,
    amount: input.amount,
    payment_type: input.payment_type ?? "salary",
    description: input.description?.trim() || null,
    entered_by: input.entered_by ?? null,
  };
  const { data, error } = await admin
    .from("labour_payments")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as LabourPaymentRow;
}

export async function deleteLabourPayment(id: number): Promise<void> {
  const { error } = await admin.from("labour_payments").delete().eq("id", id);
  if (error) throw error;
}

// ─── Aggregates (computed server-side for performance) ───

export interface LabourSummary {
  labour: LabourRow;
  total_paid: number;
  payment_count: number;
  last_payment_date: string | null;
}

/**
 * Compute total paid + last payment date for each labour.
 * If `activeOnly` is true, only active labours are returned.
 */
export async function getLabourSummaries(activeOnly = false): Promise<LabourSummary[]> {
  const paymentsQ: any = admin
    .from("labour_payments")
    .select("labour_id, amount, payment_date")
    .order("payment_date", { ascending: false });

  const [labours, payments] = await Promise.all([
    getAllLabours(activeOnly),
    paymentsQ.then(({ data, error }: { data: any; error: any }) => {
      if (error) throw error;
      return (data || []) as { labour_id: number; amount: number; payment_date: string }[];
    }),
  ]);

  // Aggregate by labour_id
  const byLabour = new Map<number, { total: number; count: number; last: string | null }>();
  for (const p of payments) {
    const cur = byLabour.get(p.labour_id) || { total: 0, count: 0, last: null };
    cur.total += Number(p.amount);
    cur.count += 1;
    // payments are sorted desc by date, so first seen = latest
    if (!cur.last) cur.last = p.payment_date;
    byLabour.set(p.labour_id, cur);
  }

  return labours.map((labour) => ({
    labour,
    total_paid: byLabour.get(labour.id)?.total ?? 0,
    payment_count: byLabour.get(labour.id)?.count ?? 0,
    last_payment_date: byLabour.get(labour.id)?.last ?? null,
  }));
}

// Type re-exports for convenience
export type { Labour, LabourPayment, LabourPaymentType };
