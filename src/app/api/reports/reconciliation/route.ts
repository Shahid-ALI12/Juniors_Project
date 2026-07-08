import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getReconciliation } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";
import { cachedGet, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Reconciliation for a date range — depends on sales/expenses.
// Historical dates (where `to` < today) can be cached longer.
const RECON_TTL_FRESH = 10_000;   // for today's range
const RECON_TTL_HISTORICAL = 60_000; // for past ranges

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const from = url.searchParams.get("from") || pktToday();
    const to = url.searchParams.get("to") || from;

    // Historical date ranges (not including today) can be cached more aggressively
    const today = pktToday();
    const isHistorical = to < today;
    const ttl = isHistorical ? RECON_TTL_HISTORICAL : RECON_TTL_FRESH;

    const data = await cachedGet(
      userKey(auth.user.id, "reconciliation", `${from}_${to}`),
      [userTag(auth.user.id, "reconciliation")],
      ttl,
      () => getReconciliation(from, to),
    );
    return NextResponse.json(data);
  } catch (err) {
    console.error("Reconciliation error:", err);
    return NextResponse.json({ error: "Failed to fetch reconciliation data", detail: getErrorDetail(err) }, { status: 500 });
  }
}
