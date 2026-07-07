import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { buildRestoreScript, validateBackup } from "@/lib/data/restore";
import type { RestoreMode, DatabaseBackup } from "@/types";

// Force dynamic — never cache.
export const dynamic = "force-dynamic";

// Max upload size: 50 MB (large backups can be big).
const MAX_BYTES = 50 * 1024 * 1024;

/**
 * POST /api/database/restore
 *
 * Body: { "backup": <DatabaseBackup JSON>, "mode": "merge" | "append" }
 * OR multipart upload of the .json file (field name "file").
 *
 * Returns: a SQL script file download (.sql).
 *
 * This endpoint DOES NOT write to the database. It only converts
 * the uploaded backup JSON into a SQL script that the user
 * reviews and runs themselves in Supabase SQL Editor.
 *
 * Auth: requires admin OR customer session (requireUser).
 */
export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    let backupJson: unknown;
    let mode: RestoreMode = "merge"; // default safest overwrite mode

    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      // ─── File upload mode ───
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "No 'file' field in upload." },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: `File too large. Max allowed: ${MAX_BYTES / 1024 / 1024} MB` },
          { status: 413 }
        );
      }
      const text = await file.text();
      try {
        backupJson = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: "File is not valid JSON." },
          { status: 400 }
        );
      }
      const modeField = form.get("mode");
      if (typeof modeField === "string" && (modeField === "merge" || modeField === "append")) {
        mode = modeField;
      }
    } else {
      // ─── JSON body mode ───
      const body = await request.json();
      backupJson = body?.backup;
      if (body?.mode === "append" || body?.mode === "merge") {
        mode = body.mode;
      }
      if (!backupJson) {
        return NextResponse.json(
          { error: "Missing 'backup' field in JSON body." },
          { status: 400 }
        );
      }
    }

    // Validate structure
    const errors = validateBackup(backupJson);
    if (errors.length > 0) {
      return NextResponse.json(
        { error: "Invalid backup file.", details: errors },
        { status: 400 }
      );
    }

    const backup = backupJson as DatabaseBackup;

    // Generate SQL script
    const result = buildRestoreScript(backup, mode);

    const requestedBy = auth.type === "admin"
      ? `admin:${auth.user.id}`
      : `customer:${auth.user.id}`;

    // Add a comment line at the very top about who requested it
    const sql = `-- Requested by: ${requestedBy}\n${result.sql}`;
    const bytes = new TextEncoder().encode(sql).byteLength;

    return new NextResponse(sql, {
      status: 200,
      headers: {
        "Content-Type": "application/sql; charset=utf-8",
        "Content-Disposition": `attachment; filename="${result.filename}"`,
        "Content-Length": String(bytes),
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "X-Restore-Mode": mode,
        "X-Restore-Rows": String(result.totalRows),
      },
    });
  } catch (err) {
    console.error("Restore error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to build restore script", detail: msg },
      { status: 500 }
    );
  }
}

/**
 * GET — informational. Returns usage docs so the endpoint is not silent
 * when accessed directly.
 */
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/database/restore",
    method: "POST",
    description:
      "Upload a backup JSON file and receive a SQL restore script. This endpoint does NOT write to the database — it only generates a .sql file you run yourself in Supabase SQL Editor.",
    auth: "Required (admin or active customer session)",
    requestModes: {
      multipart:
        "FormData with 'file' (the .json backup) and optional 'mode' (merge|append).",
      json: "JSON body { backup: <DatabaseBackup>, mode: 'merge'|'append' }.",
    },
    modes: {
      merge: "UPSERT — overwrite existing rows with backup data (default).",
      append: "Skip existing IDs — only insert rows with new IDs.",
    },
    maxBytes: MAX_BYTES,
  });
}
