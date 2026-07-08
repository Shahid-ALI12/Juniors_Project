import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getCustomerBalance, getAllCustomerBalances } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";
import { cachedGet, userKey, userTag } from "@/lib/cache";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

// Customer balances change with sales/purchases — short TTL
const BALANCE_TTL = 10_000;

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customer_id");

    // No customer_id → return all balances as a map
    if (!customerId) {
      const balances = await cachedGet(
        userKey(auth.user.id, "all-customer-balances"),
        [userTag(auth.user.id, "customer-balance")],
        BALANCE_TTL,
        () => getAllCustomerBalances(),
      );
      return NextResponse.json(balances);
    }

    const cid = Number(customerId);
    const balance = await cachedGet(
      userKey(auth.user.id, "customer-balance", String(cid)),
      [userTag(auth.user.id, "customer-balance")],
      BALANCE_TTL,
      () => getCustomerBalance(cid),
    );
    return NextResponse.json(balance);
  } catch (err) {
    console.error("Customer balance error:", err);
    return NextResponse.json({ error: "Failed to fetch customer balance", detail: getErrorDetail(err) }, { status: 500 });
  }
}
