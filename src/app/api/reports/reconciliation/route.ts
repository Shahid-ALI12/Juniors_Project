import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getReconciliation } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

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
