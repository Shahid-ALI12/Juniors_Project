import { requireAdminUser } from "@/lib/auth/server-user";
import { NextRequest, NextResponse } from "next/server";

import { getCustomerBalance, getAllCustomerBalances } from "@/lib/data/reports";
import { getErrorDetail } from "@/lib/api-error";

// Prevent Next.js from caching GET responses
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const customerId = url.searchParams.get("customer_id");

    // No customer_id → return all balances as a map
    if (!customerId) {
      const balances = await getAllCustomerBalances();
      return NextResponse.json(balances);
    }

    const balance = await getCustomerBalance(Number(customerId));
    return NextResponse.json(balance);
  } catch (err) {
    console.error("Customer balance error:", err);
    return NextResponse.json({ error: "Failed to fetch customer balance", detail: getErrorDetail(err) }, { status: 500 });
  }
}