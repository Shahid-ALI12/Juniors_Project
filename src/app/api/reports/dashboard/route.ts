import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getDashboardMetrics } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";
import { cachedGet, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Dashboard metrics change with sales/expenses — short TTL
const DASHBOARD_TTL = 5_000;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const today = pktToday();
    const metrics = await cachedGet(
      userKey(auth.user.id, "dashboard", today),
      [userTag(auth.user.id, "dashboard"), userTag(auth.user.id, "customer-balance")],
      DASHBOARD_TTL,
      () => getDashboardMetrics(today),
    );
    return NextResponse.json(metrics);
  } catch (err) {
    console.error("Dashboard metrics error:", err);
    return NextResponse.json({ error: "Failed to fetch dashboard metrics", detail: getErrorDetail(err) }, { status: 500 });
  }
}
