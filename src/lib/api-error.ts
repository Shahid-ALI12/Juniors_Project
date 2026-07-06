/**
 * Extracts a user-facing error detail from a caught error.
 *
 * SECURITY: In production, database error details are NEVER sent to the client.
 * Only a generic message is returned. Full details are logged server-side.
 *
 * In development, detailed errors are returned for easier debugging.
 */

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Patterns that indicate a database / infrastructure error.
 * These contain sensitive schema info (table names, column names, RPC names, etc.)
 * and must NEVER be leaked to the client in production.
 */
const DB_ERROR_PATTERNS = [
  "does not exist",
  "relation",
  "column",
  "constraint",
  "permission",
  "RPC",
  "function",
  "not configured",
  "SUPABASE",
  "timeout",
  "network",
  "ECONNREFUSED",
  "fetch",
  "unique",
  "duplicate",
  "violates",
  "null",
  "check",
  "foreign key",
  "Type",
  "argument",
  "parameter",
  "syntax error",
  "42883",   // undefined_function
  "42P01",   // undefined_table
  "42703",   // undefined_column
  "23505",   // unique_violation
  "23503",   // foreign_key_violation
  "42P07",   // duplicate_table
];

/** PostgreSQL 5-char error codes */
const PG_CODE_RE = /^[A-Z0-9]{5}$/;

function isDbError(msg: string): boolean {
  return DB_ERROR_PATTERNS.some((p) => msg.includes(p));
}

export function getErrorDetail(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;

  if (typeof e.message === "string") {
    const msg = e.message as string;

    // In production: never expose DB/infra error details to the client
    if (IS_PROD) {
      // Log the real error server-side for debugging
      console.error("[api-error]", msg);
      // Only return non-sensitive messages (e.g. user-facing validation)
      if (!isDbError(msg)) {
        return msg;
      }
      return undefined; // Client gets generic "Failed to..." message only
    }

    // Development: return all DB error details for easier debugging
    if (isDbError(msg)) {
      return msg;
    }

    // If it has a Supabase error code (5-char PostgreSQL code), always show
    if (typeof e.code === "string" && PG_CODE_RE.test(e.code as string)) {
      return msg;
    }
  }

  // Include .hint from PostgrestError if available
  if (typeof e.hint === "string" && !IS_PROD) {
    return `${e.hint}`;
  }

  // Generic Error instances with known safe patterns
  if (err instanceof Error) {
    const msg = err.message;
    if (IS_PROD) return undefined;
    if (
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("SUPABASE") ||
      msg.includes("not configured") ||
      msg.includes("does not exist") ||
      msg.includes("Type error")
    ) {
      return msg;
    }
  }

  return undefined;
}