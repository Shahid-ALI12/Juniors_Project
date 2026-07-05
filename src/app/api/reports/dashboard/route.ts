import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getDashboardMetrics } from "@/lib/data/reports";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const today = new Date().toISOString().split("T")[0];
    const metrics = await getDashboardMetrics(today);
    return NextResponse.json(metrics);
  } catch (err) {
    console.error("Dashboard metrics error:", err);
    return NextResponse.json({ error: "Failed to fetch dashboard metrics" }, { status: 500 });
  }
}
