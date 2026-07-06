import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getDashboardMetrics } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

/** Get current date in PKT (UTC+5:30) as YYYY-MM-DD */
function pktToday(): string {
  const d = new Date();
  return new Date(d.getTime() + (5 * 60) * 60000).toISOString().split("T")[0];
}

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const today = pktToday();
    const metrics = await getDashboardMetrics(today);
    return NextResponse.json(metrics);
  } catch (err) {
    console.error("Dashboard metrics error:", err);
    return NextResponse.json({ error: "Failed to fetch dashboard metrics", detail: getErrorDetail(err) }, { status: 500 });
  }
}
