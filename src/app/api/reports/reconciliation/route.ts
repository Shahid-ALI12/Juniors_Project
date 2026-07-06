import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getReconciliation } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

/** Get current date in PKT (UTC+5:30) as YYYY-MM-DD */
function pktToday(): string {
  const d = new Date();
  return new Date(d.getTime() + (5 * 60 + 30) * 60000).toISOString().split("T")[0];
}

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || pktToday();
    const to = url.searchParams.get("to") || from;

    const data = await getReconciliation(from, to);
    return NextResponse.json(data);
  } catch (err) {
    console.error("Reconciliation error:", err);
    return NextResponse.json({ error: "Failed to fetch reconciliation data", detail: getErrorDetail(err) }, { status: 500 });
  }
}
