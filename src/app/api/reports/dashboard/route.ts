import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getDashboardMetrics } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

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
