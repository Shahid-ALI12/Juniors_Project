import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getErrorDetail } from "@/lib/api-error";
import { getAllLabours, getLabourById } from "@/lib/data/labours";
import {
  getAllLaboursMonthlySummary,
  getLabourMonthlySummary,
} from "@/lib/data/labour-daily-wages";

export const dynamic = "force-dynamic";

/**
 * GET /api/labour-monthly-summary?month=YYYY-MM
 *   Returns monthly summary for ALL labours for the given month.
 *   Default month = current PKT month.
 *   Response: {
 *     month: "YYYY-MM",
 *     summaries: [
 *       { labour, labour_id, month, total_earned, total_paid, balance_due, status, ... }
 *     ]
 *   }
 *
 * GET /api/labour-monthly-summary?month=YYYY-MM&labour_id=N
 *   Returns monthly summary for ONE labour (includes labour object).
 */
export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const sp = url.searchParams;

    // Resolve month (default = current PKT month)
    let month = sp.get("month") || "";
    if (!month) {
      const now = new Date();
      // Use PKT (+05:00) so "current month" matches what the user sees
      const pkt = new Date(now.getTime() + 5 * 60 * 60 * 1000);
      const y = pkt.getUTCFullYear();
      const m = pkt.getUTCMonth() + 1;
      month = `${y}-${String(m).padStart(2, "0")}`;
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { error: "month must be in YYYY-MM format" },
        { status: 400 }
      );
    }

    // Single labour?
    const labourIdStr = sp.get("labour_id");
    if (labourIdStr) {
      const labour_id = Number(labourIdStr);
      if (!Number.isFinite(labour_id) || labour_id <= 0) {
        return NextResponse.json(
          { error: "labour_id must be a positive number" },
          { status: 400 }
        );
      }
      const [labour, summary] = await Promise.all([
        getLabourById(labour_id),
        getLabourMonthlySummary(labour_id, month),
      ]);
      if (!labour) {
        return NextResponse.json(
          { error: `Labour #${labour_id} not found` },
          { status: 404 }
        );
      }
      return NextResponse.json({
        month,
        labour,
        summary,
      });
    }

    // All labours — fetch master list + monthly aggregates
    const [labours, summaryMap] = await Promise.all([
      getAllLabours(false), // include inactive too — user might want full history
      getAllLaboursMonthlySummary(month),
    ]);

    const summaries = labours.map((labour) => {
      const s = summaryMap.get(labour.id);
      // Fall back to a zero summary if labour had no activity this month
      return {
        labour,
        labour_id: labour.id,
        month,
        total_earned: s?.total_earned ?? 0,
        total_paid: s?.total_paid ?? 0,
        balance_due: s?.balance_due ?? 0,
        status: s?.status ?? "not_paid",
        wage_count: s?.wage_count ?? 0,
        payment_count: s?.payment_count ?? 0,
      };
    });

    return NextResponse.json({
      month,
      summaries,
    });
  } catch (err) {
    console.error("Fetch labour monthly summary error:", err);
    return NextResponse.json(
      { error: "Failed to fetch labour monthly summary", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}
