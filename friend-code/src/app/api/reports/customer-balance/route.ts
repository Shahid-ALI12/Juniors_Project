import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/server-user";
import { getCustomerBalance } from "@/lib/data/reports";

export async function GET(request: NextRequest) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(request.url);
    const customerId = Number(url.searchParams.get("customer_id"));
    if (!customerId) return NextResponse.json({ error: "customer_id required" }, { status: 400 });

    const balance = await getCustomerBalance(customerId);
    return NextResponse.json(balance);
  } catch (err) {
    console.error("Customer balance error:", err);
    return NextResponse.json({ error: "Failed to fetch customer balance" }, { status: 500 });
  }
}
