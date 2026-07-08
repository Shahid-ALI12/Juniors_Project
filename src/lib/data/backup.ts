import { admin } from "@/lib/supabase/server-admin";
import { pktToday } from "@/lib/pkt-date";
import type { DatabaseBackup, BackupFilters } from "@/types";

// ────────────────────────────────────────────────────────────
// Database Backup — server-side, read-only.
//
// Reads ALL business tables (master + transactional) and returns
// a structured JSON object. app_customers (login + password hashes)
// is intentionally EXCLUDED for security.
//
// Master data (products, locations, customers, suppliers,
// cash_accounts, product_stock) is ALWAYS included regardless of
// date filter — without it the backup is meaningless (FK refs
// would dangle on restore).
//
// Transactional data (sales, mix_orders, purchases, expenses,
// cash_ledger, cash_transfers) is filtered by date when a filter
// is applied.
// ────────────────────────────────────────────────────────────

const SCHEMA_VERSION = "1";

/** Resolve a BackupFilters into a concrete {from, to} date range (PKT). */
function resolveRange(filters: BackupFilters): { from: string | null; to: string | null } {
  const today = pktToday();
  switch (filters.type) {
    case "all":
      return { from: null, to: null };
    case "today":
      return { from: today, to: today };
    case "month": {
      // First day of current PKT month
      const d = new Date(today + "T00:00:00+05:00");
      const first = new Date(d.getFullYear(), d.getMonth(), 1);
      const from = first.toISOString().slice(0, 10);
      return { from, to: today };
    }
    case "year": {
      // Jan 1 of current PKT year (calendar year — Pakistan default)
      const d = new Date(today + "T00:00:00+05:00");
      const from = `${d.getFullYear()}-01-01`;
      return { from, to: today };
    }
    case "custom":
      return { from: filters.from ?? null, to: filters.to ?? null };
    default:
      return { from: null, to: null };
  }
}

/** Helper: fetch all rows from a table, no filter. */
async function fetchAll<T>(table: string): Promise<T[]> {
  const { data, error } = await admin.from(table).select("*").order("id", { ascending: true });
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return (data || []) as T[];
}

/** Helper: fetch rows from a table filtered by a date column. */
async function fetchByDate<T>(
  table: string,
  dateColumn: string,
  from: string | null,
  to: string | null
): Promise<T[]> {
  let q = admin.from(table).select("*").order(dateColumn, { ascending: false });
  if (from) q = q.gte(dateColumn, from);
  if (to) q = q.lte(dateColumn, to);
  const { data, error } = await q;
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
  return (data || []) as T[];
}

/**
 * Build a complete database backup object.
 *
 * @param filters date filter for transactional tables
 * @param exportedBy identifier of the user requesting the backup
 *                   (e.g., "admin:<uuid>" or "customer:<id>")
 */
export async function buildDatabaseBackup(
  filters: BackupFilters,
  exportedBy: string
): Promise<DatabaseBackup> {
  const { from, to } = resolveRange(filters);

  // ─── Master data (always full) ───
  // Locations are now re-included (Farmhouse / Shop) to support per-location stock.
  // Labours master is also always full (labour_payments + labour_daily_wages
  // FK-reference it, so a backup without the master would dangle on restore).
  const [
    products,
    locations,
    customers,
    suppliers,
    cash_accounts,
    product_stock,
    labours,
  ] = await Promise.all([
    fetchAll<any>("products"),
    fetchAll<any>("locations"),
    fetchAll<any>("customers"),
    fetchAll<any>("suppliers"),
    fetchAll<any>("cash_accounts"),
    fetchAll<any>("product_stock"),
    fetchAll<any>("labours"),
  ]);

  // ─── Transactional data (date-filtered) ───
  const [
    sales,
    mix_orders,
    purchases,
    expenses,
    cash_ledger,
    cash_transfers,
    labour_payments,
    labour_daily_wages,
  ] = await Promise.all([
    fetchByDate<any>("sales", "sale_date", from, to),
    fetchByDate<any>("mix_orders", "order_date", from, to),
    fetchByDate<any>("purchases", "purchase_date", from, to),
    fetchByDate<any>("expenses", "expense_date", from, to),
    fetchByDate<any>("cash_ledger", "entry_date", from, to),
    fetchByDate<any>("cash_transfers", "transfer_date", from, to),
    fetchByDate<any>("labour_payments", "payment_date", from, to),
    fetchByDate<any>("labour_daily_wages", "wage_date", from, to),
  ]);

  return {
    version: "1.0",
    exported_at: new Date().toISOString(),
    exported_by: exportedBy,
    filters: {
      type: filters.type,
      from,
      to,
    },
    schema_version: SCHEMA_VERSION,
    data: {
      products,
      locations,
      customers,
      suppliers,
      cash_accounts,
      product_stock,
      labours,
      sales,
      mix_orders,
      purchases,
      expenses,
      cash_ledger,
      cash_transfers,
      labour_payments,
      labour_daily_wages,
    },
  };
}

/**
 * Compute a human-readable summary of what will be in the backup.
 * Used by the UI to show the user before they download.
 */
export function describeFilter(filters: BackupFilters): { label: string; range: string | null } {
  const { from, to } = resolveRange(filters);
  switch (filters.type) {
    case "all":
      return { label: "All Database", range: null };
    case "today":
      return { label: "Today Only", range: from };
    case "month":
      return { label: "This Month", range: `${from} → ${to}` };
    case "year":
      return { label: "This Year (Jan–Dec)", range: `${from} → ${to}` };
    case "custom":
      return { label: "Custom Range", range: `${from ?? "…"} → ${to ?? "…"}` };
    default:
      return { label: "Unknown", range: null };
  }
}

/** Generate a filename like: backup_2026-07-07_all.json */
export function backupFilename(filters: BackupFilters): string {
  const today = pktToday();
  return `backup_${today}_${filters.type}.json`;
}
