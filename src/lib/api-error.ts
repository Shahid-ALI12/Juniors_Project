/**
 * Extracts a user-facing error detail from a caught error.
 * Supabase PostgrestError has .message, .code, .hint properties.
 * We now return the message for ALL database errors so the user
 * can see exactly what's wrong (missing table, missing function, etc.).
 */
export function getErrorDetail(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;

    // Supabase PostgrestError — always include the message for DB errors
    if (typeof e.message === "string") {
      const msg = e.message as string;
      // Database / Supabase related patterns
      if (
        msg.includes("does not exist") ||
        msg.includes("relation") ||
        msg.includes("column") ||
        msg.includes("constraint") ||
        msg.includes("permission") ||
        msg.includes("RPC") ||
        msg.includes("function") ||
        msg.includes("not configured") ||
        msg.includes("SUPABASE") ||
        msg.includes("timeout") ||
        msg.includes("network") ||
        msg.includes("ECONNREFUSED") ||
        msg.includes("fetch") ||
        msg.includes("unique") ||
        msg.includes("duplicate") ||
        msg.includes("violates") ||
        msg.includes("null") ||
        msg.includes("check") ||
        msg.includes("foreign key") ||
        msg.includes("Type") ||
        msg.includes("argument") ||
        msg.includes("parameter") ||
        msg.includes("syntax error") ||
        msg.includes("42883") ||   // undefined_function
        msg.includes("42P01") ||   // undefined_table
        msg.includes("42703") ||   // undefined_column
        msg.includes("23505") ||   // unique_violation
        msg.includes("23503") ||   // foreign_key_violation
        msg.includes("42P07")      // duplicate_table
      ) {
        return msg;
      }

      // If it has a Supabase error code (5-char PostgreSQL code), always show
      if (typeof e.code === "string" && (e.code as string).length === 5) {
        return msg;
      }
    }

    // Include .hint from PostgrestError if available
    if (typeof e.hint === "string") {
      return `${e.hint}`;
    }
  }

  // Generic Error instances with known safe patterns
  if (err instanceof Error) {
    const msg = err.message;
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