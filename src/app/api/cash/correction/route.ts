import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { correctBalanceRPC, getCorrections } from "@/lib/data/cash";
import { getErrorDetail } from "@/lib/api-error";
import { pktToday } from "@/lib/pkt-date";
import { invalidateByTag, userTag } from "@/lib/cache";

export async function POST(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const body = await request.json();
    const { account_id, target, correction_date, name, reason } = body;

    if (!account_id || target === undefined) {
      return NextResponse.json({ error: "account_id and target required" }, { status: 400 });
    }

    // Name and Reason are COMPULSORY — reject if missing or empty
    const trimmedName = (typeof name === "string" ? name : "").trim();
    const trimmedReason = (typeof reason === "string" ? reason : "").trim();
    if (!trimmedName) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (!trimmedReason) {
      return NextResponse.json({ error: "Reason is required" }, { status: 400 });
    }

    const id = await correctBalanceRPC({
      account_id,
      target: Number(target),
      correction_date: correction_date || pktToday(),
      entered_by: `admin:${auth.user.id}`,
      name: trimmedName,
      reason: trimmedReason,
    });

    // Correction changes balances → invalidate cash domain
    invalidateByTag(userTag(auth.user.id, "cash"));
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    console.error("Cash correction error:", err);
    return NextResponse.json({ error: "Failed to correct balance", detail: getErrorDetail(err) }, { status: 500 });
  }
}

// GET — list all manual corrections (source_type = 'correction') with account names
export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const corrections = await getCorrections();
    return NextResponse.json({ corrections });
  } catch (err) {
    console.error("Cash corrections fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch corrections", detail: getErrorDetail(err) },
      { status: 500 }
    );
  }
}
