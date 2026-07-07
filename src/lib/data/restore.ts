import type { DatabaseBackup, RestoreMode } from "@/types";

// ────────────────────────────────────────────────────────────
// Database Restore — SQL script generator.
//
// This module is PURE — it does NOT touch the database.
// It takes a parsed backup JSON object and produces a
// PostgreSQL script that the user can review and run in
// Supabase SQL Editor.
//
// Safety:
// - Only the 12 known business tables are processed.
// - app_customers (login + password hashes) is NEVER restored.
// - Each INSERT uses ON CONFLICT (id) so existing rows are
//   either updated (Safe Merge mode) or skipped (Append mode),
//   NEVER duplicated.
// - The whole script is wrapped in a BEGIN/COMMIT transaction
//   so any error rolls back everything.
// - Tables are restored in FK-safe order: masters first, then
//   transactions.
// ────────────────────────────────────────────────────────────

// Tables in restore order (FK-safe: masters before transactions).
// app_customers is intentionally excluded — never restored.
const RESTORE_ORDER: { table: keyof DatabaseBackup["data"]; kind: "master" | "transactional" }[] = [
  { table: "products",      kind: "master" },
  { table: "locations",     kind: "master" },
  { table: "customers",     kind: "master" },
  { table: "suppliers",     kind: "master" },
  { table: "cash_accounts", kind: "master" },
  { table: "product_stock", kind: "master" },
  { table: "sales",          kind: "transactional" },
  { table: "mix_orders",    kind: "transactional" },
  { table: "purchases",     kind: "transactional" },
  { table: "expenses",      kind: "transactional" },
  { table: "cash_ledger",   kind: "transactional" },
  { table: "cash_transfers", kind: "transactional" },
];

/** Escape a single SQL literal value. */
function esc(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "NULL";
    return String(v);
  }
  if (typeof v === "bigint") return v.toString();
  if (v instanceof Date) return `'${v.toISOString()}'`;
  // string — escape single quotes by doubling them
  const s = String(v).replace(/'/g, "''");
  return `'${s}'`;
}

/** Generate a single INSERT ... ON CONFLICT statement. */
function genInsert(
  table: string,
  row: Record<string, unknown>,
  mode: RestoreMode
): string {
  const cols = Object.keys(row);
  if (cols.length === 0) return `-- empty row skipped`;

  const colList = cols.map((c) => `"${c}"`).join(", ");
  const valList = cols.map((c) => esc(row[c])).join(", ");

  // ON CONFLICT (id) → either update non-id cols or skip
  const nonIdCols = cols.filter((c) => c !== "id");
  let conflict: string;
  if (mode === "merge") {
    // Safe Merge — overwrite existing rows with backup data
    const sets = nonIdCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(", ");
    conflict = `ON CONFLICT (id) DO UPDATE SET ${sets}`;
  } else {
    // Append — only insert new rows, leave existing untouched
    conflict = `ON CONFLICT (id) DO NOTHING`;
  }

  return `INSERT INTO "${table}" (${colList}) VALUES (${valList}) ${conflict};`;
}

/** Generate a setval() call to sync sequences after restore (best-effort). */
function genSetval(table: string, rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const maxId = rows.reduce((m, r) => {
    const id = Number(r.id);
    return Number.isFinite(id) && id > m ? id : m;
  }, 0);
  if (maxId === 0) return "";
  // Postgres sequence naming convention: <table>_id_seq
  return `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), GREATEST(${maxId}, (SELECT COALESCE(MAX(id), 0) FROM "${table}")));`;
}

export interface RestoreResult {
  /** Full SQL script text. */
  sql: string;
  /** Filename to suggest for download. */
  filename: string;
  /** Counts per table for the UI summary. */
  counts: Record<string, number>;
  /** Total rows processed. */
  totalRows: number;
  /** Warnings (non-fatal issues). */
  warnings: string[];
}

/**
 * Validate that a parsed JSON object looks like a DatabaseBackup.
 * Returns array of error strings (empty = valid).
 */
export function validateBackup(obj: unknown): string[] {
  const errors: string[] = [];
  if (!obj || typeof obj !== "object") {
    return ["Backup file is not a valid JSON object."];
  }
  const o = obj as Record<string, unknown>;
  if (!o.version) errors.push('Missing "version" field.');
  if (!o.exported_at) errors.push('Missing "exported_at" field.');
  if (!o.data || typeof o.data !== "object") {
    errors.push('Missing "data" object.');
    return errors;
  }
  const data = o.data as Record<string, unknown>;
  for (const t of RESTORE_ORDER) {
    if (!Array.isArray(data[t.table])) {
      errors.push(`Missing or non-array "data.${t.table}".`);
    }
  }
  return errors;
}

/**
 * Build a SQL restore script from a parsed backup object.
 *
 * @param backup  Parsed backup JSON (already validated).
 * @param mode    Restore mode: "merge" (UPSERT) or "append" (skip existing).
 */
export function buildRestoreScript(
  backup: DatabaseBackup,
  mode: RestoreMode
): RestoreResult {
  const counts: Record<string, number> = {};
  let totalRows = 0;
  const warnings: string[] = [];

  // Build the body — group by table in restore order
  const sections: string[] = [];

  // Header
  const header = [
    `-- Database Restore Script`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Source backup exported: ${backup.exported_at}`,
    `-- Restore mode: ${mode === "merge" ? "Safe Merge (UPSERT — overwrite existing)" : "Append Only (skip existing IDs)"}`,
    `-- Schema version: ${backup.schema_version || "?"}`,
    `--`,
    `-- ⚠️  REVIEW THIS SCRIPT BEFORE RUNNING.`,
    `-- Run it in Supabase SQL Editor (Dashboard → SQL Editor → New query).`,
    `-- If anything goes wrong, ROLLBACK will undo everything (this script`,
    `-- is wrapped in a single transaction).`,
    `--`,
    `-- Tables restored: ${RESTORE_ORDER.length}`,
    `-- app_customers (login + password hashes) is NEVER restored.`,
    ``,
    `BEGIN;`,
    ``,
  ].join("\n");
  sections.push(header);

  // Master data section
  sections.push(`-- ──────────────────────────────────────────────`);
  sections.push(`-- MASTER DATA (products, locations, customers, etc.)`);
  sections.push(`-- ──────────────────────────────────────────────`);
  sections.push(``);

  for (const { table, kind } of RESTORE_ORDER) {
    const rows = (backup.data[table] as unknown as Record<string, unknown>[]) || [];
    counts[table] = rows.length;
    totalRows += rows.length;

    sections.push(`-- ${table} (${kind}) — ${rows.length} row(s)`);
    if (rows.length === 0) {
      sections.push(`-- (no rows — skipped)`);
      sections.push(``);
      continue;
    }
    for (const row of rows) {
      sections.push(genInsert(table, row, mode));
    }
    // Sync sequence after inserts
    const setval = genSetval(table, rows);
    if (setval) sections.push(setval);
    sections.push(``);
  }

  // Footer
  const footer = [
    `-- ──────────────────────────────────────────────`,
    `-- End of restore script`,
    `-- Total rows processed: ${totalRows}`,
    `-- Mode: ${mode}`,
    `-- ──────────────────────────────────────────────`,
    ``,
    `COMMIT;`,
    ``,
    `-- ✅ If you see no errors above, your data has been restored.`,
    `-- Refresh the app to see the restored data.`,
    ``,
  ].join("\n");
  sections.push(footer);

  // Filename: restore_YYYY-MM-DD_<mode>.sql
  const today = new Date().toISOString().slice(0, 10);
  const filename = `restore_${today}_${mode}.sql`;

  return {
    sql: sections.join("\n"),
    filename,
    counts,
    totalRows,
    warnings,
  };
}

/** Pretty-print counts as a readable summary string. */
export function summarizeCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}
