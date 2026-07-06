import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/server-user";
import { correctBalanceRPC } from "@/lib/data/cash";
import { getErrorDetail } from "@/lib/api-error";

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { account_id, target, correction_date } = body;

    if (!account_id || target === undefined) {
      return NextResponse.json({ error: "account_id and target required" }, { status: 400 });
    }

    const id = await correctBalanceRPC({
      account_id,
      target: Number(target),
      correction_date: correction_date || (() => { const d = new Date(); return new Date(d.getTime() + (5 * 60) * 60000).toISOString().split("T")[0]; })(),
      entered_by: `admin:${auth.user.id}`,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("Cash correction error:", err);
    return NextResponse.json({ error: "Failed to correct balance", detail: getErrorDetail(err) }, { status: 500 });
  }
}
