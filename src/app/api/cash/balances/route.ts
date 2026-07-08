import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getCashBalances } from "@/lib/data/cash";
import { getErrorDetail } from "@/lib/api-error";
import { cachedGet, userKey, userTag } from "@/lib/cache";

// Cash balances change on every transfer/expense/sale — short TTL
const BALANCES_TTL = 5_000;

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const balances = await cachedGet(
      userKey(auth.user.id, "cash-balances"),
      [userTag(auth.user.id, "cash"), userTag(auth.user.id, "cash-balances")],
      BALANCES_TTL,
      () => getCashBalances(),
    );
    return NextResponse.json({ balances });
  } catch (err) {
    console.error("Fetch cash balances error:", err);
    return NextResponse.json({ error: "Failed to fetch cash balances", detail: getErrorDetail(err) }, { status: 500 });
  }
}
