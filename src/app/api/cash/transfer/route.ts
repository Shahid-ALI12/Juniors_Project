import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { transferCashRPC } from "@/lib/data/cash";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const { getCashTransfers } = await import("@/lib/data/cash");
    const url = new URL(request.url);
    const filters: Record<string, string> = {};
    if (url.searchParams.get("transfer_date")) filters.transfer_date = url.searchParams.get("transfer_date")!;
    if (url.searchParams.get("transfer_date_gte")) filters.transfer_date_gte = url.searchParams.get("transfer_date_gte")!;
    if (url.searchParams.get("transfer_date_lte")) filters.transfer_date_lte = url.searchParams.get("transfer_date_lte")!;

    const transfers = await getCashTransfers(filters as any);
    return NextResponse.json({ transfers });
  } catch (err) {
    console.error("Fetch transfers error:", err);
    return NextResponse.json({ error: "Failed to fetch transfers", detail: getErrorDetail(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { from_account_id, to_account_id, amount, transfer_date, notes } = body;

    if (!from_account_id || !to_account_id || !amount) {
      return NextResponse.json({ error: "from_account_id, to_account_id, amount required" }, { status: 400 });
    }

    const id = await transferCashRPC({
      from_account_id,
      to_account_id,
      amount: Number(amount),
      transfer_date: transfer_date || pktToday(),
      notes: notes?.trim() || null,
      entered_by: `admin:${auth.user.id}`,
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("Transfer cash error:", err);
    return NextResponse.json({ error: "Failed to transfer cash", detail: getErrorDetail(err) }, { status: 500 });
  }
}
