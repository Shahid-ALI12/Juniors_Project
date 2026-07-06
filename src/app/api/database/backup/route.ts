import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { buildDatabaseBackup, backupFilename } from "@/lib/data/backup";
import type { BackupFilter } from "@/types";

// Force dynamic — never cache a backup response.
export const dynamic = "force-dynamic";

const VALID_FILTERS: BackupFilter[] = ["all", "today", "month", "year", "custom"];

/**
 * GET /api/database/backup?filter=all
 * GET /api/database/backup?filter=custom&from=2026-01-01&to=2026-06-30
 *
 * Returns a JSON file download containing the full backup.
 *
 * Auth: requires admin OR customer session (requireUser).
 * Note: in this app, the business portal uses customer-session auth,
 * so the owner is logged in as a "customer" with an active subscription.
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const filterParam = (url.searchParams.get("filter") || "all") as BackupFilter;
    const from = url.searchParams.get("from") || undefined;
    const to = url.searchParams.get("to") || undefined;

    // Validate filter
    if (!VALID_FILTERS.includes(filterParam)) {
      return NextResponse.json(
        { error: `Invalid filter. Must be one of: ${VALID_FILTERS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate custom range
    if (filterParam === "custom") {
      if (!from || !to) {
        return NextResponse.json(
          { error: "Custom filter requires 'from' and 'to' query params (YYYY-MM-DD)" },
          { status: 400 }
        );
      }
      // Sanity: from <= to
      if (from > to) {
        return NextResponse.json(
          { error: "'from' date must be before or equal to 'to' date" },
          { status: 400 }
        );
      }
    }

    const exportedBy = auth.type === "admin"
      ? `admin:${auth.user.id}`
      : `customer:${auth.user.id}`;

    const backup = await buildDatabaseBackup(
      { type: filterParam, from, to },
      exportedBy
    );

    const filename = backupFilename({ type: filterParam, from, to });
    const json = JSON.stringify(backup, null, 2);
    const bytes = new TextEncoder().encode(json).byteLength;

    // Stream as a downloadable file
    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(bytes),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    console.error("Backup error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate backup", detail: msg },
      { status: 500 }
    );
  }
}
