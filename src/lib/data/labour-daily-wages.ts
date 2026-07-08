import { admin } from "@/lib/supabase/server-admin";
import type {
  LabourDailyWage,
  LabourMonthlySummary,
  LabourPaymentStatus,
} from "@/types";

// ────────────────────────────────────────────────────────────
// Labour Daily Wages — server-side data access.
//
// All functions use the service-role `admin` client (bypasses RLS).
// Mirrors the pattern of src/lib/data/labours.ts.
//
// This module is SELF-CONTAINED — it only touches the
// `labour_daily_wages` table (and reads `labour_payments` for
// the monthly summary computation).
// ────────────────────────────────────────────────────────────

export interface LabourDailyWageRow {
  id: number;
  labour_id: number;
  wage_date: string;
  amount: number;
  notes: string | null;
  entered_by: string | null;
  created_at: string;
}

// ─── Daily Wages CRUD ───

export async function getLabourDailyWages(filters?: {
  labour_id?: number;
  wage_date?: string;
  wage_date_gte?: string;
  wage_date_lte?: string;
  includeLabour?: boolean;
}): Promise<LabourDailyWageRow[]> {
  let q: any = admin
    .from("labour_daily_wages")
    .select(filters?.includeLabour ? "*, labours(*)" : "*")
    .order("wage_date", { ascending: false })
    .order("id", { ascending: false });

  if (filters?.labour_id)      q = q.eq("labour_id", filters.labour_id);
  if (filters?.wage_date)      q = q.eq("wage_date", filters.wage_date);
  if (filters?.wage_date_gte)  q = q.gte("wage_date", filters.wage_date_gte);
  if (filters?.wage_date_lte)  q = q.lte("wage_date", filters.wage_date_lte);

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as LabourDailyWageRow[];
}

export async function createLabourDailyWage(input: {
  labour_id: number;
  wage_date: string;
  amount: number;
  notes?: string | null;
  entered_by?: string | null;
}): Promise<LabourDailyWageRow> {
  const row = {
    labour_id: input.labour_id,
    wage_date: input.wage_date,
    amount: input.amount,
    notes: input.notes?.trim() || null,
    entered_by: input.entered_by ?? null,
  };
  const { data, error } = await admin
    .from("labour_daily_wages")
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data as LabourDailyWageRow;
}

/**
 * Upsert a daily wage entry for a (labour_id, wage_date) pair.
 *
 * If an entry already exists for this labour on this date, it is
 * updated with the new amount/notes. Otherwise a new row is inserted.
 *
 * This is what the bulk "Save All" button on the daily-entry form
 * calls — it lets the user re-submit a date without hitting the
 * unique constraint error.
 */
export async function upsertLabourDailyWage(input: {
  labour_id: number;
  wage_date: string;
  amount: number;
  notes?: string | null;
  entered_by?: string | null;
}): Promise<LabourDailyWageRow> {
  // Try INSERT first; on unique-violation (code 23505), fall back to UPDATE.
  // Supabase JS client doesn't expose ON CONFLICT, so we do it in two steps.
  const row = {
    labour_id: input.labour_id,
    wage_date: input.wage_date,
    amount: input.amount,
    notes: input.notes?.trim() || null,
    entered_by: input.entered_by ?? null,
  };

  const { data: ins, error: insErr } = await admin
    .from("labour_daily_wages")
    .insert(row)
    .select()
    .single();

  if (!insErr) return ins as LabourDailyWageRow;

  // 23505 = unique_violation → entry already exists for this (labour, date)
  if (insErr.code !== "23505") throw insErr;

  // Existing entry — update it
  const { data: upd, error: updErr } = await admin
    .from("labour_daily_wages")
    .update({
      amount: row.amount,
      notes: row.notes,
      entered_by: row.entered_by,
    })
    .eq("labour_id", row.labour_id)
    .eq("wage_date", row.wage_date)
    .select()
    .single();

  if (updErr) throw updErr;
  return upd as LabourDailyWageRow;
}

export async function deleteLabourDailyWage(id: number): Promise<void> {
  const { error } = await admin.from("labour_daily_wages").delete().eq("id", id);
  if (error) throw error;
}

// ─── Monthly Summary ───

/**
 * Compute monthly summary for ONE labour.
 *
 * Returns: total_earned, total_paid, balance_due, status, wage_count, payment_count.
 *
 *   total_earned = sum of labour_daily_wages.amount in [month-01, month-31]
 *   total_paid   = sum of labour_payments.amount   in [month-01, month-31]
 *   balance_due  = total_earned − total_paid
 *   status       = "not_paid" if total_paid === 0, else "paid"
 */
export async function getLabourMonthlySummary(
  labourId: number,
  month: string // YYYY-MM
): Promise<LabourMonthlySummary> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid month format: ${month} (expected YYYY-MM)`);
  }

  // Compute first/last day of the month (PKT, but date-only — TZ doesn't matter)
  const [yearStr, monStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr);
  const lastDay = new Date(year, mon, 0).getDate(); // mon is 1-indexed; day 0 of next month = last day of this month
  const fromDate = `${month}-01`;
  const toDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const [wagesRes, paymentsRes] = await Promise.all([
    admin
      .from("labour_daily_wages")
      .select("amount")
      .eq("labour_id", labourId)
      .gte("wage_date", fromDate)
      .lte("wage_date", toDate),
    admin
      .from("labour_payments")
      .select("amount")
      .eq("labour_id", labourId)
      .gte("payment_date", fromDate)
      .lte("payment_date", toDate),
  ]);

  if (wagesRes.error) throw wagesRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const wages = (wagesRes.data || []) as { amount: number }[];
  const payments = (paymentsRes.data || []) as { amount: number }[];

  const total_earned = wages.reduce((s, r) => s + Number(r.amount), 0);
  const total_paid = payments.reduce((s, r) => s + Number(r.amount), 0);
  const balance_due = total_earned - total_paid;
  const status: LabourPaymentStatus = total_paid > 0 ? "paid" : "not_paid";

  return {
    labour_id: labourId,
    month,
    total_earned,
    total_paid,
    balance_due,
    status,
    wage_count: wages.length,
    payment_count: payments.length,
  };
}

/**
 * Compute monthly summary for ALL labours in a single month.
 *
 * More efficient than calling getLabourMonthlySummary() in a loop —
 * fetches all wages + payments for the month in two queries.
 */
export async function getAllLaboursMonthlySummary(
  month: string // YYYY-MM
): Promise<Map<number, LabourMonthlySummary>> {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error(`Invalid month format: ${month} (expected YYYY-MM)`);
  }

  const [yearStr, monStr] = month.split("-");
  const year = Number(yearStr);
  const mon = Number(monStr);
  const lastDay = new Date(year, mon, 0).getDate();
  const fromDate = `${month}-01`;
  const toDate = `${month}-${String(lastDay).padStart(2, "0")}`;

  const [wagesRes, paymentsRes] = await Promise.all([
    admin
      .from("labour_daily_wages")
      .select("labour_id, amount")
      .gte("wage_date", fromDate)
      .lte("wage_date", toDate),
    admin
      .from("labour_payments")
      .select("labour_id, amount")
      .gte("payment_date", fromDate)
      .lte("payment_date", toDate),
  ]);

  if (wagesRes.error) throw wagesRes.error;
  if (paymentsRes.error) throw paymentsRes.error;

  const wages = (wagesRes.data || []) as { labour_id: number; amount: number }[];
  const payments = (paymentsRes.data || []) as { labour_id: number; amount: number }[];

  // Aggregate by labour_id
  const byLabour = new Map<
    number,
    { earned: number; paid: number; wageCount: number; paymentCount: number }
  >();

  for (const w of wages) {
    const cur = byLabour.get(w.labour_id) || { earned: 0, paid: 0, wageCount: 0, paymentCount: 0 };
    cur.earned += Number(w.amount);
    cur.wageCount += 1;
    byLabour.set(w.labour_id, cur);
  }
  for (const p of payments) {
    const cur = byLabour.get(p.labour_id) || { earned: 0, paid: 0, wageCount: 0, paymentCount: 0 };
    cur.paid += Number(p.amount);
    cur.paymentCount += 1;
    byLabour.set(p.labour_id, cur);
  }

  // Build final result — for labours with NO activity this month,
  // we don't return an entry (the UI falls back to a default zero summary).
  const result = new Map<number, LabourMonthlySummary>();
  for (const [labourId, agg] of byLabour.entries()) {
    const balance_due = agg.earned - agg.paid;
    const status: LabourPaymentStatus = agg.paid > 0 ? "paid" : "not_paid";
    result.set(labourId, {
      labour_id: labourId,
      month,
      total_earned: agg.earned,
      total_paid: agg.paid,
      balance_due,
      status,
      wage_count: agg.wageCount,
      payment_count: agg.paymentCount,
    });
  }

  return result;
}

// Type re-exports for convenience
export type { LabourDailyWage, LabourMonthlySummary, LabourPaymentStatus };
